"use client";

import { useState } from "react";
import type { Locale, Party, Prefill } from "@/lib/types";
import { dict } from "@/lib/i18n";
import { setLangCookie } from "@/lib/locale";
import LanguageGate from "./LanguageGate";
import PartyPicker from "./PartyPicker";
import HandoffInterstitial from "./HandoffInterstitial";
import AccidentForm from "./AccidentForm";
import { CheckCircle2 } from "lucide-react";

type Screen = "picker" | "form" | "handoff" | "done" | "oneside";

// Single-device session: language gate → "who are you?" picker → fill your part
// → auto-continue to the other driver's part → complete. Both parts required
// (gated one-sided exit lives in the handoff screen). No forced order.
export default function ReportSession({
  reportId,
  aSlug,
  aPrefill,
  bSlug,
  bPrefill,
  initialFlags,
  initialLang,
  doneParties,
}: {
  reportId: string;
  aSlug: string;
  aPrefill: Prefill;
  bSlug: string;
  bPrefill: Prefill;
  initialFlags: string[];
  initialLang: Locale | null;
  doneParties: Party[];
}) {
  const [locale, setLocale] = useState<Locale | null>(initialLang);
  const [done, setDone] = useState<Party[]>(doneParties);
  const [active, setActive] = useState<Party | null>(null);
  const [screen, setScreen] = useState<Screen>(
    doneParties.length >= 2 ? "done" : "picker"
  );

  // Language gate first.
  if (locale === null) {
    return (
      <LanguageGate
        reportId={reportId}
        hint={aPrefill._langHint ?? bPrefill._langHint}
        onSelect={(l) => {
          setLangCookie(reportId, "A", l);
          setLangCookie(reportId, "B", l);
          setLocale(l);
        }}
      />
    );
  }

  const t = dict[locale];
  const ctx = (p: Party) =>
    p === "A" ? { slug: aSlug, prefill: aPrefill } : { slug: bSlug, prefill: bPrefill };

  if (screen === "picker") {
    return (
      <PartyPicker
        lang={locale}
        done={done}
        onPick={(p) => {
          setActive(p);
          setScreen("form");
        }}
      />
    );
  }

  if (screen === "form" && active) {
    const { slug, prefill } = ctx(active);
    return (
      <AccidentForm
        key={active}
        reportId={reportId}
        party={active}
        slug={slug}
        prefill={prefill}
        initialFlags={initialFlags}
        alreadySubmitted={false}
        initialLang={locale}
        onLangChange={setLocale}
        onComplete={(p) => {
          const nextDone = done.includes(p) ? done : [...done, p];
          setDone(nextDone);
          if (nextDone.length >= 2) setScreen("done");
          else setScreen("handoff");
        }}
      />
    );
  }

  if (screen === "handoff" && active) {
    const other: Party = active === "A" ? "B" : "A";
    return (
      <HandoffInterstitial
        lang={locale}
        nextParty={other}
        reportId={reportId}
        slug={ctx(active).slug}
        onContinue={() => {
          setActive(other);
          setScreen("form");
        }}
        onOneSided={() => setScreen("oneside")}
      />
    );
  }

  // done / one-sided completion
  return (
    <div className="p-safe flex min-h-[100dvh] items-center justify-center">
      <div className="animate-fade-up flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <CheckCircle2 className="size-20 text-primary" />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {screen === "oneside" ? t.oneSidedTitle : t.reportComplete}
          </h1>
          {screen === "oneside" && (
            <p className="mt-2 text-muted-foreground">{t.oneSidedShort}</p>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground">{reportId}</span>
      </div>
    </div>
  );
}
