"use client";

import { useState } from "react";
import { dict, type Lang } from "@/lib/i18n";

// Hard, one-way baton pass. A's zone is already locked server-side by the time
// this shows. No "back to my form" — the phone goes to the other driver.
export default function LockHandover({
  lang,
  onProceed,
  onAbsent,
}: {
  lang: Lang;
  onProceed: () => void;
  onAbsent: () => void | Promise<void>;
}) {
  const t = dict[lang];
  const [busy, setBusy] = useState(false);

  return (
    <div className="gate" dir={t.dir} lang={lang}>
      <div className="gate-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/najm-logo.svg" alt="نجم Najm" className="gate-logo" />
        <div style={{ fontSize: 52 }}>🤝</div>
        <div className="gate-head">
          <div className="gate-h1">{t.handoverTitle}</div>
          <div className="gate-h2">🔒 {t.handoverSaved}</div>
        </div>
        <div className="gate-opts">
          <button className="btn-primary wide" onClick={onProceed} style={{ minHeight: 64 }}>
            {t.iAmOther}
          </button>
          <button
            className="btn-back"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onAbsent();
            }}
            style={{ minHeight: 52 }}
          >
            {t.bNotHere}
          </button>
        </div>
      </div>
    </div>
  );
}
