"use client";

import type { Locale } from "@/lib/types";

// Najm logo (official mark, served from /public).
function Logo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/najm-logo.svg" alt="نجم Najm" className="gate-logo" />;
}

export default function LanguageGate({
  reportId,
  hint,
  onSelect,
}: {
  reportId: string;
  hint?: Locale;
  onSelect: (locale: Locale) => void;
}) {
  return (
    <div className="gate">
      <div className="gate-inner">
        <Logo />
        <div className="gate-head">
          <div className="gate-h1" lang="ar">
            اختر لغتك
          </div>
          <div className="gate-h2" lang="en">
            Choose your language
          </div>
        </div>

        <div className="gate-opts">
          <button
            className={`gate-opt ${hint === "ar" ? "hinted" : ""}`}
            onClick={() => onSelect("ar")}
            lang="ar"
            aria-label="العربية، اللغة العربية"
          >
            <span className="gate-name">العربية</span>
          </button>

          <button
            className={`gate-opt ${hint === "en" ? "hinted" : ""}`}
            onClick={() => onSelect("en")}
            lang="en"
            aria-label="English language"
          >
            <span className="gate-name">English</span>
          </button>
        </div>

        <div className="gate-ref mono">{reportId}</div>
      </div>
    </div>
  );
}
