"use client";

import { useEffect, useState } from "react";
import FlagStrip from "@/components/FlagStrip";
import type { PhotoAnalysis } from "@/lib/types";

interface ReportView {
  reportId: string;
  status: string;
  flags: string[];
  routing: string;
  causer: {
    vehicle?: { number?: string; registrationType?: string; nationality?: string };
    driver?: { identityNumber?: string; fullName?: string; mobile?: string };
    faultDeclaration?: { accepted: boolean; at: string };
  };
  accident: {
    governorate?: string;
    area?: string;
    locationText?: string;
    dateTime?: string;
    coordinates?: { lat: number; lng: number; accuracy?: number };
    injuries?: boolean;
  };
  properties: { type: string; ownership: string; address: string }[];
  affected: {
    idx: number;
    vehicle: { number?: string };
    driver: { fullName?: string; identityNumber?: string };
    ack: string;
    ackAt: string | null;
    lookupFailed: boolean;
  }[];
  photoAnalysis: PhotoAnalysis | null;
  audit: { party: string | null; event: string; detail: string | null; at: string }[];
}

// Agent/demo view: eTraffic report status. Polls every 2s (live over the socket
// too via broadcastFlags, but polling keeps the dashboard simple).
export default function DashboardClient({ reportId }: { reportId: string }) {
  const [data, setData] = useState<ReportView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/report/${reportId}`, { cache: "no-store" });
        if (!res.ok) return alive && setErr(`Report ${reportId} not found`);
        const json = (await res.json()) as ReportView;
        if (alive) { setData(json); setErr(null); }
      } catch (e) {
        if (alive) setErr(String(e));
      }
    };
    load();
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
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
                {data.causer?.faultDeclaration?.accepted && (
                  <span className="mono" style={{ fontSize: 11, color: "var(--muted)", marginInlineStart: 8 }}>
                    fault admitted {data.causer.faultDeclaration.at}
                  </span>
                )}
              </p>
            </div>

            <div className="card">
              <h2>Causer (at-fault)</h2>
              <p className="mono" style={{ fontSize: 13 }}>
                {data.causer?.driver?.fullName ?? data.causer?.driver?.identityNumber ?? "—"} ·
                vehicle {data.causer?.vehicle?.number ?? "—"} · {data.causer?.vehicle?.registrationType ?? "—"}
              </p>
            </div>

            <div className="card">
              <h2>Affected parties</h2>
              {(!data.affected || data.affected.length === 0) && <p className="muted">None.</p>}
              {data.affected?.map((a) => (
                <p key={a.idx} className="mono" style={{ fontSize: 13 }}>
                  #{a.idx + 1} · {a.driver?.fullName ?? a.driver?.identityNumber} · vehicle {a.vehicle?.number} ·{" "}
                  <b style={{ color: a.ack === "accepted" ? "var(--accent)" : a.ack === "rejected" ? "var(--critical)" : "var(--warn)" }}>
                    {a.ack}
                  </b>
                  {a.lookupFailed ? " · lookup-failed" : ""}
                </p>
              ))}
            </div>

            {data.properties?.length > 0 && (
              <div className="card">
                <h2>Properties</h2>
                {data.properties.map((p, i) => (
                  <p key={i} className="mono" style={{ fontSize: 13 }}>{p.type} · {p.ownership} · {p.address}</p>
                ))}
              </div>
            )}

            <div className="card">
              <h2>Accident</h2>
              <p className="mono" style={{ fontSize: 13 }}>
                {[data.accident?.governorate, data.accident?.area, data.accident?.locationText].filter(Boolean).join(" · ") || "—"}
                {data.accident?.dateTime ? ` · ${data.accident.dateTime}` : ""}
                {data.accident?.coordinates ? ` · ${data.accident.coordinates.lat}, ${data.accident.coordinates.lng}` : ""}
                {data.accident?.injuries ? " · INJURIES" : ""}
              </p>
            </div>

            {data.photoAnalysis && (
              <div className="card">
                <h2>
                  Preliminary photo analysis{" "}
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--warn)", fontWeight: 700 }}
                  >
                    AI · for review — not a verdict
                  </span>
                </h2>
                {data.photoAnalysis.status !== "complete" || !data.photoAnalysis.result ? (
                  <p className="muted" style={{ fontSize: 13 }}>
                    {data.photoAnalysis.status === "failed"
                      ? `Analysis failed — routed to manual review. (${data.photoAnalysis.error ?? "error"})`
                      : "No photos analyzed."}
                  </p>
                ) : (
                  <div style={{ fontSize: 13 }}>
                    <p>{data.photoAnalysis.result.damageSummary}</p>
                    <p className="mono" style={{ fontSize: 12, marginTop: 6 }}>
                      indication:{" "}
                      <b>
                        {data.photoAnalysis.result.faultIndication.party}
                      </b>{" "}
                      · confidence{" "}
                      {Math.round(
                        data.photoAnalysis.result.faultIndication.confidence * 100
                      )}
                      % · model {data.photoAnalysis.modelVersion}
                    </p>
                    {data.photoAnalysis.result.consistency.discrepancies.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <b style={{ color: "var(--warn)" }}>Discrepancies:</b>
                        {data.photoAnalysis.result.consistency.discrepancies.map(
                          (d, i) => (
                            <p key={i} className="mono" style={{ fontSize: 12, margin: "2px 0" }}>
                              · {d}
                            </p>
                          )
                        )}
                      </div>
                    )}
                    {data.photoAnalysis.result.imageQualityIssues.length > 0 && (
                      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        image quality:{" "}
                        {data.photoAnalysis.result.imageQualityIssues.join("; ")}
                      </p>
                    )}
                    <p className="muted" style={{ fontSize: 11, marginTop: 6, fontStyle: "italic" }}>
                      {data.photoAnalysis.result.faultIndication.limitations}
                    </p>
                  </div>
                )}
              </div>
            )}

            <FlagStrip flags={data.flags} lang="en" />

            <div className="card">
              <h2>Audit trail</h2>
              {data.audit.map((e, i) => (
                <p key={i} className="mono muted" style={{ fontSize: 12, margin: "3px 0" }}>
                  {e.at} · {e.party ?? "-"} · {e.event}{e.detail ? ` · ${e.detail}` : ""}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
