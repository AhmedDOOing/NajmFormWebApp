"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  PresenceState,
  ServerToClientEvents,
} from "@/lib/socketContract";
import type { Locale, Party } from "@/lib/types";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Joins the report room over the socket and mirrors live state into React.
export function useReportSocket(reportId: string, party: Party, slug: string, lang: Locale) {
  const [presence, setPresence] = useState<PresenceState>({
    A: party === "A" ? "connected" : "absent",
    B: party === "B" ? "connected" : "absent",
  });
  const [syncComplete, setSyncComplete] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [serverFlags, setServerFlags] = useState<string[] | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<TypedSocket | null>(null);
  // Keep the latest lang in a ref so the connect handler (bound once) can emit
  // it right after join without reconnecting the socket on every toggle.
  const langRef = useRef<Locale>(lang);
  langRef.current = lang;

  useEffect(() => {
    const socket: TypedSocket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join", { reportId, party, slug }, (res) => {
        if (res?.presence) setPresence(res.presence);
      });
      // Ordered after join on the same socket, so socket.data is set server-side.
      socket.emit("lang", { locale: langRef.current });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("presence", (s) => setPresence(s));
    socket.on("sync:complete", () => setSyncComplete(true));
    socket.on("party:timeout", (d) => {
      if (d.party === "B") setTimedOut(true);
    });
    socket.on("report:flags", (d) => setServerFlags(d.flags));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [reportId, party, slug]);

  const setStatus = (p: "filling" | "submitted") => {
    socketRef.current?.emit("status", { presence: p });
  };

  const sendLocation = (data: {
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    label: string | null;
    source: "gps" | "manual";
  }) => {
    socketRef.current?.emit("location", data);
  };

  const sendLang = (locale: Locale) => {
    socketRef.current?.emit("lang", { locale });
  };

  return { presence, syncComplete, timedOut, serverFlags, connected, setStatus, sendLocation, sendLang };
}
