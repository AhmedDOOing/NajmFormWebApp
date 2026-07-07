"use client";

import { useState } from "react";
import type { Locale, Party } from "@/lib/types";
import { dict } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

// After a driver finishes their part: pass the phone to the other driver
// (primary), or the gated one-sided exit (declare a reason, then file).
export default function HandoffInterstitial({
  lang,
  nextParty,
  reportId,
  slug,
  onContinue,
  onOneSided,
}: {
  lang: Locale;
  nextParty: Party;
  reportId: string;
  slug: string;
  onContinue: () => void;
  onOneSided: () => void;
}) {
  const t = dict[lang];
  const reasons = [t.reasonLeft, t.reasonRefused, t.reasonLater, t.reasonOther];
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function fileOneSided() {
    setBusy(true);
    try {
      await fetch(`/api/report/${reportId}/absent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, reason }),
      });
      onOneSided();
    } finally {
      setBusy(false);
    }
  }

  const nextLabel = nextParty === "A" ? t.driver1 : t.driver2;

  return (
    <div className="p-safe flex min-h-[100dvh] items-center justify-center">
      <div className="animate-fade-up flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <CheckCircle2 className="size-16 text-primary" />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t.partSaved}</h1>
          <p className="mt-2 text-muted-foreground">
            {t.passPhone} <span className="font-semibold text-foreground">{nextLabel}</span>
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Button
            size="lg"
            onClick={onContinue}
            className="cta-premium h-14 w-full rounded-2xl text-base font-bold"
          >
            {t.continueOther}
            <ArrowLeft className="size-5 ltr:rotate-180" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="h-11 text-muted-foreground">
                {t.otherNotHere}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.otherNotHereTitle}</AlertDialogTitle>
                <AlertDialogDescription>{t.otherNotHereBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <RadioGroup value={reason} onValueChange={setReason} className="gap-3 py-2">
                {reasons.map((r) => (
                  <div key={r} className="flex items-center gap-3">
                    <RadioGroupItem value={r} id={r} />
                    <Label htmlFor={r} className="cursor-pointer text-sm font-normal">
                      {r}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.back}</AlertDialogCancel>
                <AlertDialogAction disabled={!reason || busy} onClick={fileOneSided}>
                  {busy ? t.submitting : t.fileOneSided}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground/70">{reportId}</span>
      </div>
    </div>
  );
}
