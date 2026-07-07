"use client";

import { useState } from "react";
import { dict, type Lang } from "@/lib/i18n";
import type { Prefill } from "@/lib/types";

// Light identity gate before Party B's zone opens. B confirms the full mobile
// number the agent captured for them. Server enforces the match + the
// retry -> PARTY_B_UNVERIFIED escalation.
export default function BIdentityCheck({
  reportId,
  slug,
  lang,
  onVerified,
  onEscalated,
}: {
  reportId: string;
  slug: string; // Party A's device-session slug
  lang: Lang;
  onVerified: (bSlug: string, bPrefill: Prefill) => void;
  onEscalated: () => void;
}) {
  const t = dict[lang];
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/report/${reportId}/verify-b`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, value }),
      });
      const j = await res.json();
      if (j.ok) {
        onVerified(j.bSlug, j.bPrefill);
      } else if (j.escalated) {
        setMsg(t.verifyEscalated);
        setTimeout(onEscalated, 1500);
      } else {
        setMsg(`${t.verifyWrong} ${j.remaining}`);
      }
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate" dir={t.dir} lang={lang}>
      <div className="gate-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/najm-logo.svg" alt="نجم Najm" className="gate-logo" />
        <div className="gate-head">
          <div className="gate-h1">{t.verifyTitle}</div>
          <div className="gate-h2">{t.verifySub}</div>
        </div>
        <div className="gate-opts">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={16}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d+]/g, ""))}
            placeholder={t.verifyPlaceholder}
            aria-label={t.verifyPlaceholder}
            style={{ textAlign: "center", fontSize: 20, letterSpacing: 2 }}
          />
          {msg && <p style={{ color: "var(--warn)", textAlign: "center" }}>{msg}</p>}
          <button
            className="btn-primary wide"
            disabled={busy || value.replace(/\D/g, "").length < 9}
            onClick={verify}
            style={{ minHeight: 60 }}
          >
            {busy ? t.submitting : t.verifyBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
