"use client";

import type { Locale } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ShieldCheck } from "lucide-react";

// Najm logo (official mark, served from /public).
function Logo() {
  return (
    <div className="brand-glow">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/najm-logo.svg" alt="نجم Najm" className="h-24 w-auto drop-shadow-xl" />
    </div>
  );
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
  const Option = ({
    locale,
    label,
    sub,
  }: {
    locale: Locale;
    label: string;
    sub: string;
  }) => (
    <Button
      variant="outline"
      size="lg"
      lang={locale}
      aria-label={locale === "ar" ? "العربية، اللغة العربية" : "English language"}
      onClick={() => onSelect(locale)}
      className={`group h-[4.5rem] w-full justify-between rounded-2xl border-border/70 bg-card/60 px-6 backdrop-blur transition-all hover:border-primary hover:bg-card ${
        hint === locale ? "border-primary ring-1 ring-primary/40" : ""
      }`}
    >
      <span className="flex flex-col items-start leading-tight">
        <span className="text-xl font-bold">{label}</span>
        <span className="text-xs font-normal text-muted-foreground">{sub}</span>
      </span>
      <ChevronLeft className="size-5 text-muted-foreground transition-all group-hover:text-primary rtl:rotate-0 ltr:rotate-180" />
    </Button>
  );

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-6">
      <div className="animate-fade-up stagger flex w-full max-w-sm flex-col items-center gap-9">
        <div className="flex flex-col items-center gap-5">
          <Logo />
          <div className="text-center">
            <h1 lang="ar" className="text-[2rem] font-extrabold tracking-tight">
              اختر لغتك
            </h1>
            <p lang="en" className="mt-1 text-base text-muted-foreground">
              Choose your language to continue
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Option locale="ar" label="العربية" sub="Arabic" />
          <Option locale="en" label="English" sub="الإنجليزية" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />
            رابط آمن خاص ببلاغك · Secure &amp; private to your report
          </span>
          <span className="font-mono text-[11px] text-muted-foreground/70">{reportId}</span>
        </div>
      </div>
    </div>
  );
}
