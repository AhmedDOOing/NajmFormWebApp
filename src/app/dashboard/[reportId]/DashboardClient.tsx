"use client";

import { useEffect, useState } from "react";
import FlagStrip from "@/components/FlagStrip";
import type { PresenceState } from "@/lib/socketContract";

interface ReportView {
  reportId: string;
  status: string;
  flags: string[];
  routing: string;
  presence: PresenceState;
  locations: {
    party: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    label: string | null;
    source: string;
    at: string;
  }[];
  submissions: { party: string; submittedAt: string; flags: string[] }[];
  audit: { party: string | null; event: string; detail: string | null; at: string }[];
  createdAt: string;
  expiresAt: string;
}

// Agent/demo view: live presence + flags for a report. Polls the status API
// (which reads the in-memory presence store) every 2s.
export default function DashboardClient({ reportId }: { reportId: string }) {
  const [data, setData] = useState<ReportView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/report/${reportId}`, { cache: "no-store" });
        if (!res.ok) {
          if (alive) setErr(`Report ${reportId} not found`);
          return;
        }
        const json = (await res.json()) as ReportView;
        if (alive) {
          setData(json);
          setErr(null);
        }
      } catch (e) {
        if (alive) setErr(String(e));
      }
    };
    load();
    const id = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [reportId]);

  return (
    <div dir="ltr">
      <div className="appbar">
        <h1>Najm dashboard</h1>
        <div className="meta mono">{reportId}</div>
      </div>
      <div className="wrap">
        {err && <div className="card">{err}</div>}
        {data && (
          <>
            <div className="card">
              <h2>Status</h2>
              <p>
                <b>{data.status}</b> · routing:{" "}
                <span className={`routing ${data.routing}`} style={{ padding: "2px 8px" }}>
                  {data.routing}
                </span>
              </p>
              <div className="presence">
                {(["A", "B"] as const).map((p) => (
                  <div className="pill" key={p}>
                    <span className="who">Party {p}</span>
                    <span>
                      <span className={`dot ${data.presence[p]}`} />
                      {data.presence[p]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2>Locations</h2>
              {(!data.locations || data.locations.length === 0) && (
                <p className="muted">No location shared yet.</p>
              )}
              {data.locations?.map((l) => (
                <p key={l.party} className="mono" style={{ fontSize: 13 }}>
                  Party {l.party} · {l.label ?? "—"} ·{" "}
                  {l.lat != null && l.lng != null
                    ? `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`
                    : "manual"}
                  {l.accuracy != null ? ` · ±${l.accuracy}m` : ""} · {l.source}
                </p>
              ))}
            </div>

            <FlagStrip flags={data.flags} lang="en" />

            <div className="card">
              <h2>Submissions</h2>
              {data.submissions.length === 0 && <p className="muted">None yet.</p>}
              {data.submissions.map((s) => (
                <p key={s.party} className="mono" style={{ fontSize: 13 }}>
                  Party {s.party} · {s.submittedAt} · [{s.flags.join(", ")}]
                </p>
              ))}
            </div>

            <div className="card">
              <h2>Audit trail</h2>
              {data.audit.map((e, i) => (
                <p key={i} className="mono muted" style={{ fontSize: 12, margin: "3px 0" }}>
                  {e.at} · {e.party ?? "-"} · {e.event}
                  {e.detail ? ` · ${e.detail}` : ""}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
