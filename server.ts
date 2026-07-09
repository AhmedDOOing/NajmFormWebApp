import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./src/lib/socketContract";
import type { Party } from "./src/lib/types";
import {
  getLink,
  getReport,
  setReportFlags,
  setReportStatus,
  audit,
  upsertLocation,
} from "./src/lib/db";
import {
  onJoin,
  onStatus,
  onDisconnect,
  getPresence,
  setIo,
  setHooks,
  broadcastFlags,
  setPartyLang,
} from "./src/lib/realtime";
import { mergeFlags, routeOutcome } from "./src/lib/flags";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    {},
    SocketData
  >(httpServer, {
    path: "/socket.io",
    cors: { origin: true },
  });

  setIo(io);

  // When Party B's SLA fires (server-side timer), flag the report and allow
  // Party-A-only progression. Persisted here because no API call triggered it.
  setHooks({
    onPartyTimeout: (reportId, party) => {
      if (party !== "B") return;
      const report = getReport(reportId);
      if (!report) return;
      const flags = mergeFlags(JSON.parse(report.flags) as string[], [
        "PARTY_B_TIMEOUT",
      ]);
      setReportFlags(reportId, flags);
      // Don't overwrite a terminal state; otherwise mark escalated.
      if (report.status === "open" || report.status === "partyA_done") {
        setReportStatus(reportId, "escalated");
      }
      audit(reportId, "party_b_timeout", new Date().toISOString(), { party: "B" });
      broadcastFlags(reportId, flags, routeOutcome(flags));
    },
  });

  io.on("connection", (socket) => {
    socket.on("join", ({ reportId, party, slug }, ack) => {
      // Validate the opaque token belongs to THIS report + party (brief §6/§9).
      const link = getLink(slug);
      if (!link || link.reportId !== reportId || link.party !== party) {
        ack?.({ ok: false, error: "token/report/party mismatch" });
        return;
      }
      const p = party as Party;
      socket.data.reportId = reportId;
      socket.data.party = p;
      socket.join(reportId);
      onJoin(reportId, p, socket.id);
      audit(reportId, "party_joined", new Date().toISOString(), { party: p });
      ack?.({ ok: true, presence: getPresence(reportId) });
    });

    socket.on("status", ({ presence }) => {
      const { reportId, party } = socket.data;
      if (!reportId || !party) return;
      onStatus(reportId, party, presence);
    });

    // A party chose/switched their UI language — surface it on the dashboard.
    socket.on("lang", ({ locale }) => {
      const { reportId, party } = socket.data;
      if (!reportId || !party) return;
      setPartyLang(reportId, party, locale);
    });

    // A party shared/updated their location. Persist to the report and fan out
    // to the room so the dashboard + the other party update live.
    socket.on("location", (data) => {
      const { reportId, party } = socket.data;
      if (!reportId || !party) return;
      const at = new Date().toISOString();
      upsertLocation({ reportId, party, at, ...data });
      audit(reportId, "location_shared", at, { party, detail: data.source });
      io.to(reportId).emit("location:shared", { party, at, ...data });
    });

    socket.on("disconnect", () => {
      const { reportId, party } = socket.data;
      if (!reportId || !party) return;
      // Grace timer before we broadcast `absent` (survives dropped mobile conns).
      onDisconnect(reportId, party, socket.id);
    });
  });

  // Bind 0.0.0.0 (all IPv4 interfaces) so a phone on the same Wi-Fi can reach the
  // dev server by LAN IP — plain listen(port) binds IPv6-only on macOS.
  httpServer.listen(port, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`▶ Najm handoff ready on http://localhost:${port}  (dev=${dev})`);
  });
});
