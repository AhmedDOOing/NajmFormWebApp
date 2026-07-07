import type { Locale, Party, PartyLocation, Presence } from "./types";

// Socket.IO event contract (build brief §6). Room = reportId.

export interface PresenceState {
  A: Presence;
  B: Presence;
}

// Client -> Server
export interface ClientToServerEvents {
  join: (
    data: { reportId: string; party: Party; slug: string },
    ack?: (res: { ok: boolean; error?: string; presence?: PresenceState }) => void
  ) => void;
  status: (data: { presence: "filling" | "submitted" }) => void;
  location: (data: {
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    label: string | null;
    source: "gps" | "manual";
  }) => void;
  lang: (data: { locale: Locale }) => void;
}

// Server -> Client (broadcast to room)
export interface ServerToClientEvents {
  presence: (state: PresenceState) => void;
  "party:submitted": (data: { party: Party }) => void;
  "sync:complete": (data: { reportId: string }) => void;
  "party:timeout": (data: { party: Party }) => void;
  "report:flags": (data: { flags: string[]; status: string }) => void;
  "location:shared": (data: PartyLocation) => void;
  "party:lang": (data: { party: Party; locale: Locale }) => void;
}

export interface SocketData {
  reportId?: string;
  party?: Party;
}
