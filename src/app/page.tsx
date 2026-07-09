"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Copy, LayoutDashboard, Loader2, Sparkles } from "lucide-react";

interface SessionResult {
  reportId: string;
  partyA: { url: string };
  partyB: { url: string };
  expiresAt: string;
}

// Premium demo landing: simulates the voice agent's POST /api/session. eTraffic
// model — mints the causer's (at-fault filer's) registered details + link.
export default function Home() {
  const [res, setRes] = useState<SessionResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function simulate() {
    setBusy(true);
    // Demo capture from the voice call: full Party A details + just Party B's
    // phone (so we can text Party B their own link). Either can be omitted.
    const body = {
      ttl: 24 * 60 * 60 * 1000,
      partyA: {
        vehicle: { nationality: "سعودية · Saudi", number: "1234", registrationType: "PRIVATE" },
        driver: {
          identityType: "الهوية الوطنية · National ID",
          identityNumber: "1023456789",
          fullName: "محمد عبدالله القحطاني",
          mobile: "0551234567",
          email: "mohammed@example.com",
        },
      },
      partyB: {
        driver: { mobile: "0509876543" },
      },
    };
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await r.json()) as SessionResult;
      setRes(json);
      toast.success("تم إنشاء البلاغ", { description: json.reportId });
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  const copy = (url: string) => {
    navigator.clipboard?.writeText(url);
    toast.success("تم نسخ الرابط · Link copied");
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-10 p-6">
      <div className="animate-fade-up flex flex-col items-center gap-6 text-center">
        <div className="brand-glow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/najm-logo.svg" alt="نجم Najm" className="h-28 w-auto drop-shadow-xl" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight" lang="ar">
            بلاغ الحادث، ببساطة
          </h1>
          <p className="text-balance text-muted-foreground" lang="en">
            Report an accident in a few calm taps — voice to phone, in Arabic or English.
          </p>
        </div>
      </div>

      {!res ? (
        <Button
          size="lg"
          disabled={busy}
          onClick={simulate}
          className="cta-premium h-14 w-full rounded-2xl text-base font-bold"
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Sparkles className="size-5" />
          )}
          محاكاة مكالمة نجم · Simulate the call
        </Button>
      ) : (
        <div className="stagger flex w-full flex-col gap-3">
          <LinkCard
            title="رابط الطرف الأول · Party A link"
            note="يبدأ البلاغ ويُدخل بياناته"
            url={res.partyA.url}
            onCopy={copy}
            primary
          />
          <LinkCard
            title="رابط الطرف الثاني · Party B link"
            note="يُدخل بياناته عبر رابطه الخاص"
            url={res.partyB.url}
            onCopy={copy}
          />
          <a
            href={`/dashboard/${res.reportId}`}
            className="mt-1 inline-flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary"
          >
            <LayoutDashboard className="size-4" />
            لوحة المتابعة · Dashboard
          </a>
        </div>
      )}
    </main>
  );
}

function LinkCard({
  title,
  note,
  url,
  onCopy,
  primary,
}: {
  title: string;
  note: string;
  url: string;
  onCopy: (u: string) => void;
  primary?: boolean;
}) {
  return (
    <Card className={primary ? "border-primary/50" : ""}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{note}</div>
          <a
            href={url}
            className="mt-1 block truncate font-mono text-xs text-primary hover:underline"
          >
            {url}
          </a>
        </div>
        <Button variant="ghost" size="icon" aria-label="Copy" onClick={() => onCopy(url)}>
          <Copy className="size-4" />
        </Button>
        <Button asChild size="icon" variant={primary ? "default" : "secondary"} aria-label="Open">
          <a href={url}>
            <ArrowLeft className="size-4 rtl:rotate-0 ltr:rotate-180" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
