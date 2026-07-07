"use client";

import { FLAG_META, routeOutcome } from "@/lib/flags";
import type { Flag } from "@/lib/types";
import { dict, type Lang } from "@/lib/i18n";

const ROUTING_LABEL: Record<string, { ar: string; en: string }> = {
  EMERGENCY: { ar: "طوارئ — اتصل 997", en: "Emergency — call 997" },
  POLICE_REPORT: { ar: "بلاغ شرطة مطلوب", en: "Police report required" },
  MANUAL_REVIEW: { ar: "مراجعة يدوية", en: "Manual review" },
  AUTOMATIC: { ar: "معالجة تلقائية", en: "Automatic processing" },
};

// Live edge-case flag strip (brief §7). Flags are computed from the current
// field state and re-rendered as the driver fills the form; the same set is
// surfaced over the socket after submit.
export default function FlagStrip({
  flags,
  lang,
}: {
  flags: string[];
  lang: Lang;
}) {
  const t = dict[lang];
  if (flags.length === 0) return null;
  const routing = routeOutcome(flags);

  return (
    <div className="flagstrip">
      <div className="fs-head">
        <span>{t.flagsTitle}</span>
        <span>
          {t.routing}: {routing}
        </span>
      </div>
      {flags.map((f) => {
        const meta = FLAG_META[f as Flag];
        if (!meta) return null;
        return (
          <div className={`flag ${meta.severity}`} key={f}>
            <span className="fdot" />
            <span className="fbody">
              <b>{lang === "ar" ? meta.ar : meta.en}</b>
              <span>{meta.outcome}</span>
            </span>
          </div>
        );
      })}
      <div className={`routing ${routing}`}>
        {lang === "ar" ? ROUTING_LABEL[routing].ar : ROUTING_LABEL[routing].en}
      </div>
    </div>
  );
}
