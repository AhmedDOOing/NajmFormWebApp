import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  PresenceState,
  ServerToClientEvents,
  SocketData,
} from "./socketContract";
import type { Locale, Party, Presence } from "./types";
import { DISCONNECT_GRACE_MS, PARTY_B_SLA_MS } from "./config";

// --------------------------------------------------------------------------
// In-memory presence + timers. Single-process only (custom Node server). For
// prod, back presence with Redis (pub/sub) so multiple server instances agree,
// and move the timers to a durable scheduler. Kept on globalThis so the store
// survives Next dev HMR of route modules.
// --------------------------------------------------------------------------

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

interface RoomState {
  presence: PresenceState;
  socketIds: { A: string | null; B: string | null };
  langs: { A: Locale | null; B: Locale | null };
  graceTimers: { A?: NodeJS.Timeout; B?: NodeJS.Timeout };
  slaTimer?: NodeJS.Timeout;
  bTimedOut: boolean;
}

// Hooks the API layer uses to react to a party submitting (set by server.ts to
// avoid a circular import with the submit route).
type OnBothSubmitted = (reportId: string) => void;
type OnPartyTimeout = (reportId: string, party: Party) => void;

interface RealtimeStore {
  io: IoServer | null;
  rooms: Map<string, RoomState>;
  // IMPORTANT: hooks live ON the store (globalThis), not as module-level lets.
  // server.ts is loaded by tsx while the Next API routes are webpack-bundled —
  // they get SEPARATE instances of this module. Only globalThis is shared, so a
  // module-level `let` set by server.ts would be null in the API-route copy.
  onBothSubmitted: OnBothSubmitted | null;
  onPartyTimeout: OnPartyTimeout | null;
}

const g = globalThis as unknown as { __najmRealtime?: RealtimeStore };
const store: RealtimeStore =
  g.__najmRealtime ??
  (g.__najmRealtime = {
    io: null,
    rooms: new Map(),
    onBothSubmitted: null,
    onPartyTimeout: null,
  });

export function setIo(io: IoServer) {
  store.io = io;
}
export function getIo(): IoServer | null {
  return store.io;
}
export function setHooks(hooks: {
  onBothSubmitted?: OnBothSubmitted;
  onPartyTimeout?: OnPartyTimeout;
}) {
  if (hooks.onBothSubmitted) store.onBothSubmitted = hooks.onBothSubmitted;
  if (hooks.onPartyTimeout) store.onPartyTimeout = hooks.onPartyTimeout;
}

function room(reportId: string): RoomState {
  let r = store.rooms.get(reportId);
  if (!r) {
    r = {
      presence: { A: "absent", B: "absent" },
      socketIds: { A: null, B: null },
      langs: { A: null, B: null },
      graceTimers: {},
      slaTimer: undefined,
      bTimedOut: false,
    };
    store.rooms.set(reportId, r);
  }
  return r;
}

export function getPresence(reportId: string): PresenceState {
  return { ...room(reportId).presence };
}

// Which language each party chose (for the dashboard).
export function setPartyLang(reportId: string, party: Party, locale: Locale) {
  room(reportId).langs[party] = locale;
  store.io?.to(reportId).emit("party:lang", { party, locale });
}
export function getLangs(reportId: string): { A: Locale | null; B: Locale | null } {
  return { ...room(reportId).langs };
}

function broadcastPresence(reportId: string) {
  store.io?.to(reportId).emit("presence", getPresence(reportId));
}

// Called on socket `join`. Clears any pending grace timer for that party.
export function onJoin(reportId: string, party: Party, socketId: string) {
  const r = room(reportId);
  const t = r.graceTimers[party];
  if (t) {
    clearTimeout(t);
    delete r.graceTimers[party];
  }
  r.socketIds[party] = socketId;
  // Don't downgrade a party that already submitted.
  if (r.presence[party] !== "submitted") r.presence[party] = "connected";
  broadcastPresence(reportId);
}

export function onStatus(reportId: string, party: Party, presence: "filling" | "submitted") {
  const r = room(reportId);
  r.presence[party] = presence;
  broadcastPresence(reportId);
}

// Called on socket disconnect. Starts the grace window before marking absent —
// survives dropped mobile connections.
export function onDisconnect(reportId: string, party: Party, socketId: string) {
  const r = room(reportId);
  // Ignore stale disconnects from a socket that was already replaced.
  if (r.socketIds[party] && r.socketIds[party] !== socketId) return;
  r.socketIds[party] = null;
  if (r.presence[party] === "submitted") return; // done; stays submitted
  r.graceTimers[party] = setTimeout(() => {
    r.presence[party] = "absent";
    delete r.graceTimers[party];
    broadcastPresence(reportId);
  }, DISCONNECT_GRACE_MS);
}

// Marks a party submitted (called from the submit API via markSubmitted).
export function markSubmitted(reportId: string, party: Party) {
  const r = room(reportId);
  r.presence[party] = "submitted";
  store.io?.to(reportId).emit("party:submitted", { party });
  broadcastPresence(reportId);
  if (r.presence.A === "submitted" && r.presence.B === "submitted") {
    store.io?.to(reportId).emit("sync:complete", { reportId });
    store.onBothSubmitted?.(reportId);
  }
}

export function broadcastFlags(reportId: string, flags: string[], status: string) {
  store.io?.to(reportId).emit("report:flags", { flags, status });
}

// Start the Party-B SLA timer when the report is created. If B never joins /
// submits within the SLA, flag PARTY_B_TIMEOUT and let Party A proceed.
export function startPartyBSla(reportId: string) {
  const r = room(reportId);
  if (r.slaTimer) return;
  r.slaTimer = setTimeout(() => {
    const cur = room(reportId);
    if (cur.presence.B === "submitted") return; // B made it
    cur.bTimedOut = true;
    store.io?.to(reportId).emit("party:timeout", { party: "B" });
    store.onPartyTimeout?.(reportId, "B");
  }, PARTY_B_SLA_MS);
}

export function cancelPartyBSla(reportId: string) {
  const r = store.rooms.get(reportId);
  if (r?.slaTimer) {
    clearTimeout(r.slaTimer);
    r.slaTimer = undefined;
  }
}
