"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { dict } from "@/lib/i18n";
import type { Prefill } from "@/lib/types";
import AccidentForm from "./AccidentForm";
import LockHandover from "./LockHandover";
import BIdentityCheck from "./BIdentityCheck";

type Screen = "loading" | "A" | "handover" | "verify" | "B" | "oneside" | "done";

// Single-device orchestrator for Party A's link: A fills -> hard handover ->
// B-identity check -> B fills. Resumes to the right screen from the server phase
// (A's zone stays locked). The two-link socket path is untouched for remote B.
export default function HandoverFlow({
  reportId,
  slug,
  prefill,
  initialFlags,
  initialLang,
}: {
  reportId: string;
  slug: string; // Party A's slug
  prefill: Prefill;
  initialFlags: string[];
  initialLang: Lang;
}) {
  const t = dict[initialLang];
  const [screen, setScreen] = useState<Screen>("loading");
  const [bCtx, setBCtx] = useState<{ slug: string; prefill: Prefill } | null>(null);
  const [partyBUrl, setPartyBUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Resume from the server-side phase.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/report/${reportId}`, { cache: "no-store" }).then((x) =>
          x.json()
        );
        if (!alive) return;
        const aSubmitted = (r.submissions ?? []).some((s: { party: string }) => s.party === "A");
        if (r.phase === "complete") setScreen("done");
        else if (r.phase === "partyB") setScreen("verify"); // re-verify to re-open B slug
        else if (r.phase === "handover") setScreen("handover");
        else setScreen(aSubmitted ? "handover" : "A"); // A done but not handed over yet
      } catch {
        if (alive) setScreen("A");
      }
    })();
    return () => {
      alive = false;
    };
  }, [reportId]);

  async function doHandover() {
    await fetch(`/api/report/${reportId}/handover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    setScreen("handover");
  }

  async function doAbsent() {
    const j = await fetch(`/api/report/${reportId}/absent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    }).then((x) => x.json());
    setPartyBUrl(j.partyBUrl ?? null);
    setScreen("oneside");
  }

  if (screen === "loading") {
    return (
      <div className="gate">
        <div className="gate-inner">
          <p className="muted">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (screen === "A") {
    return (
      <AccidentForm
        reportId={reportId}
        party="A"
        slug={slug}
        prefill={prefill}
        initialFlags={initialFlags}
        alreadySubmitted={false}
        initialLang={initialLang}
        onComplete={doHandover}
      />
    );
  }

  if (screen === "handover") {
    return (
      <LockHandover lang={initialLang} onProceed={() => setScreen("verify")} onAbsent={doAbsent} />
    );
  }

  if (screen === "verify") {
    return (
      <BIdentityCheck
        reportId={reportId}
        slug={slug}
        lang={initialLang}
        onVerified={(bSlug, bPrefill) => {
          setBCtx({ slug: bSlug, prefill: bPrefill });
          setScreen("B");
        }}
        onEscalated={() => setScreen("done")}
      />
    );
  }

  if (screen === "B" && bCtx) {
    return (
      <AccidentForm
        reportId={reportId}
        party="B"
        slug={bCtx.slug}
        prefill={bCtx.prefill}
        initialFlags={initialFlags}
        alreadySubmitted={false}
        initialLang={initialLang}
      />
    );
  }

  if (screen === "oneside") {
    return (
      <div className="gate" dir={t.dir} lang={initialLang}>
        <div className="gate-inner">
          <div style={{ fontSize: 52 }}>✓</div>
          <div className="gate-head">
            <div className="gate-h1">{t.oneSidedTitle}</div>
            <div className="gate-h2">{t.oneSidedBody}</div>
          </div>
          {partyBUrl && (
            <div className="gate-opts">
              <div className="mono" style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all", textAlign: "center" }}>
                {partyBUrl}
              </div>
              <button
                className="btn-primary wide"
                onClick={() => {
                  navigator.clipboard?.writeText(partyBUrl).then(() => setCopied(true));
                }}
              >
                {copied ? t.copied : t.copyLink}
              </button>
            </div>
          )}
          <div className="gate-ref mono">{reportId}</div>
        </div>
      </div>
    );
  }

  // done / complete
  return (
    <div className="gate" dir={t.dir} lang={initialLang}>
      <div className="gate-inner">
        <div style={{ fontSize: 56 }}>✓</div>
        <div className="gate-head">
          <div className="gate-h1">{t.reportComplete}</div>
        </div>
        <div className="gate-ref mono">{reportId}</div>
      </div>
    </div>
  );
}
