"use client";

import type { Locale, Party } from "@/lib/types";
import { dict } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Check, ChevronLeft, User } from "lucide-react";

// "Who are you?" — the driver self-selects their party before the form. No
// forced order; a party already submitted shows a ✓ and is locked.
export default function PartyPicker({
  lang,
  done,
  onPick,
}: {
  lang: Locale;
  done: Party[];
  onPick: (party: Party) => void;
}) {
  const t = dict[lang];
  const isDone = (p: Party) => done.includes(p);

  const Option = ({ party, label, sub }: { party: Party; label: string; sub: string }) => {
    const complete = isDone(party);
    return (
      <Button
        variant="outline"
        size="lg"
        disabled={complete}
        onClick={() => onPick(party)}
        className={`group h-[4.75rem] w-full justify-between rounded-2xl border-border/70 bg-card/60 px-5 backdrop-blur transition-all hover:border-primary hover:bg-card disabled:opacity-70`}
      >
        <span className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-primary">
            {complete ? <Check className="size-5" /> : <User className="size-5" />}
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-lg font-bold">{label}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {complete ? t.p_submitted : sub}
            </span>
          </span>
        </span>
        {!complete && (
          <ChevronLeft className="size-5 text-muted-foreground transition-all group-hover:text-primary ltr:rotate-180" />
        )}
      </Button>
    );
  };

  return (
    <div className="p-safe flex min-h-[100dvh] items-center justify-center">
      <div className="animate-fade-up stagger flex w-full max-w-sm flex-col items-center gap-9">
        <div className="brand-glow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/najm-logo.svg" alt="نجم Najm" className="h-16 w-auto drop-shadow-xl" />
        </div>
        <div className="text-center">
          <h1 className="text-[1.9rem] font-extrabold tracking-tight">{t.whoTitle}</h1>
          <p className="mt-1 text-base text-muted-foreground">{t.whoSub}</p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <Option party="A" label={t.driver1} sub={t.driver1sub} />
          <Option party="B" label={t.driver2} sub={t.driver2sub} />
        </div>
      </div>
    </div>
  );
}
