"use client";

import { useState } from "react";

interface SessionResult {
  reportId: string;
  partyA: { url: string };
  partyB: { url: string };
  expiresAt: string;
}

// Dev/demo landing: simulates the voice agent's POST /api/session so you can
// grab both links + the dashboard in one click. Party A prefill is rich (agent
// captured it on the call); Party B is minimal (they never spoke to the agent).
export default function Home() {
  const [res, setRes] = useState<SessionResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function simulate() {
    setBusy(true);
    const body = {
      ttl: 24 * 60 * 60 * 1000,
      prefill: {
        A: {
          city: "الرياض",
          district: "العليا",
          fullName: "محمد عبدالله القحطاني",
          nationalId: "1023456789",
          nationality: "سعودي",
          mobile: "0551234567",
          licenceNo: "L8842190",
          licenceExpiry: "2027-03-01",
          plate: "أ ب ج 4821",
          makeModel: "تويوتا كامري",
          year: "2022",
          colour: "أبيض",
          vehicleType: "private",
          registrationStatus: "valid",
          insuranceStatus: "valid",
          insurer: "التعاونية",
          accidentType: "اصطدام خلفي",
          vehiclesInvolved: 2,
          description: "توقفت عند الإشارة واصطدمت بي المركبة الخلفية.",
          otherPartyStatus: "present",
          injuries: false,
          _agentFilledFields: [
            "city", "district", "fullName", "nationalId", "nationality",
            "mobile", "licenceNo", "licenceExpiry", "plate", "makeModel",
            "year", "colour", "vehicleType", "registrationStatus",
            "insuranceStatus", "insurer", "accidentType", "vehiclesInvolved",
            "description", "otherPartyStatus",
          ],
        },
        B: {
          mobile: "0509876543",
          _agentFilledFields: ["mobile"],
        },
      },
    };
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setRes(await r.json());
    setBusy(false);
  }

  return (
    <div dir="ltr">
      <div className="appbar">
        <h1>Najm — Voice→Chat handoff (demo)</h1>
      </div>
      <div className="wrap">
        <div className="card">
          <h2>Simulate the voice agent</h2>
          <p className="muted">
            Mints one report + two opaque short links. Party A opens a fully
            pre-filled form; Party B opens a near-empty one. No PII in the URL.
          </p>
          <button className="btn" onClick={simulate} disabled={busy}>
            {busy ? "Minting…" : "POST /api/session"}
          </button>
        </div>

        {res && (
          <div className="card">
            <h2>Report {res.reportId}</h2>
            <p className="muted">Open each link in a separate tab to see live presence sync.</p>
            <p>
              <b>Party A</b> (pre-filled):<br />
              <a href={res.partyA.url}>{res.partyA.url}</a>
            </p>
            <p>
              <b>Party B</b> (minimal):<br />
              <a href={res.partyB.url}>{res.partyB.url}</a>
            </p>
            <p>
              <b>Dashboard</b>:<br />
              <a href={`/dashboard/${res.reportId}`}>/dashboard/{res.reportId}</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
