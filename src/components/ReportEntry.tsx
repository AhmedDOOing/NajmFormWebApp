"use client";

import { useState } from "react";
import type { Locale, Party, Prefill } from "@/lib/types";
import { setLangCookie } from "@/lib/locale";
import LanguageGate from "./LanguageGate";
import AccidentForm from "./AccidentForm";

// Thin gate in front of the existing form. If the server already found a saved
// locale cookie, `initialLang` is set and we render the form straight away
// (refresh / resumed link never re-prompts). Otherwise we show the language
// gate; choosing sets the cookie + local state and drops into the form — no
// reload, no duplicated resolver logic.
export default function ReportEntry({
  reportId,
  party,
  slug,
  prefill,
  initialFlags,
  alreadySubmitted,
  initialLang,
}: {
  reportId: string;
  party: Party;
  slug: string;
  prefill: Prefill;
  initialFlags: string[];
  alreadySubmitted: boolean;
  initialLang: Locale | null;
}) {
  const [locale, setLocale] = useState<Locale | null>(initialLang);

  if (locale === null) {
    return (
      <LanguageGate
        reportId={reportId}
        hint={prefill._langHint}
        onSelect={(l) => {
          setLangCookie(reportId, party, l);
          setLocale(l);
        }}
      />
    );
  }

  return (
    <AccidentForm
      reportId={reportId}
      party={party}
      slug={slug}
      prefill={prefill}
      initialFlags={initialFlags}
      alreadySubmitted={alreadySubmitted}
      initialLang={locale}
    />
  );
}
