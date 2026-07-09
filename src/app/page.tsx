"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Copy, LayoutDashboard, Loader2, Phone, User, Users } from "lucide-react";

interface SessionResult {
  reportId: string;
  partyA: { url: string };
  partyB: { url: string };
  expiresAt: string;
}

// Demo Party A / Party B details a voice call might capture.
const A = {
  vehicle: { nationality: "سعودية · Saudi", number: "1234", registrationType: "PRIVATE" },
  driver: {
    identityType: "الهوية الوطنية · National ID",
    identityNumber: "1023456789",
    fullName: "محمد عبدالله القحطاني",
    mobile: "0551234567",
    email: "mohammed@example.com",
  },
};
const Bfull = {
  vehicle: { nationality: "البحرين · Bahrain", number: "7391", registrationType: "COMMERCIAL" },
  driver: {
    identityType: "إقامة · Iqama",
    identityNumber: "1122334455",
    fullName: "عمران خان · Imran Khan",
    mobile: "0509876543",
    email: "imran@example.com",
  },
};

// The 3 call-capture workflows (§4 flexible data collection).
type Scenario = {
  key: string;
  icon: typeof User;
  ar: string;
  en: string;
  body: object;
  showB: boolean; // whether Party B's link is surfaced on the landing
  bNote: string; // what Party B's link contains (when shown)
};
const SCENARIOS: Scenario[] = [
  {
    key: "a",
    icon: User,
    ar: "الطرف الأول فقط",
    en: "Party A only",
    body: { partyA: A },
    showB: false, // only Party A's link — B is added later from A's done screen
    bNote: "",
  },
  {
    key: "ab-phone",
    icon: Phone,
    ar: "الطرف الأول + جوال الطرف الثاني",
    en: "Party A + Party B's phone",
    body: { partyA: A, partyB: { driver: { mobile: Bfull.driver.mobile } } },
    showB: true,
    bNote: "الجوال مُعبّأ مسبقًا — يُرسل الرابط إليه · Phone prefilled — text B their link",
  },
  {
    key: "both",
    icon: Users,
    ar: "كلا الطرفين",
    en: "Both parties",
    body: { partyA: A, partyB: Bfull },
    showB: true,
    bNote: "البيانات مُعبّأة مسبقًا · Details prefilled",
  },
];

export default function Home() {
  const [res, setRes] = useState<SessionResult | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function simulate(sc: Scenario) {
    setBusyKey(sc.key);
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ttl: 24 * 60 * 60 * 1000, ...sc.body }),
      });
      const json = (await r.json()) as SessionResult;
      setRes(json);
      setScenario(sc);
      toast.success("تم إنشاء البلاغ", { description: json.reportId });
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyKey(null);
    }
  }

  const copy = (url: string) => {
    navigator.clipboard?.writeText(url);
    toast.success("تم نسخ الرابط · Link copied");
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-8 p-6">
      <div className="animate-fade-up flex flex-col items-center gap-5 text-center">
        <div className="brand-glow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/najm-logo.svg" alt="نجم Najm" className="h-24 w-auto drop-shadow-xl" />
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
        <div className="flex w-full flex-col gap-3">
          <p className="text-center text-sm text-muted-foreground">
            محاكاة مكالمة نجم — اختر ما التقطته المكالمة:
            <br />
            <span lang="en">Simulate the call — pick what it captured</span>
          </p>
          {SCENARIOS.map((sc) => {
            const Icon = sc.icon;
            return (
              <button
                key={sc.key}
                disabled={busyKey !== null}
                onClick={() => simulate(sc)}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-start transition hover:border-primary/60 disabled:opacity-60"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  {busyKey === sc.key ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold" lang="ar">{sc.ar}</span>
                  <span className="block text-xs text-muted-foreground" lang="en">{sc.en}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="stagger flex w-full flex-col gap-3">
          <div className="text-center text-xs text-muted-foreground">
            {scenario?.ar} · <span lang="en">{scenario?.en}</span>
          </div>
          <LinkCard
            title="رابط الطرف الأول · Party A link"
            note="يبدأ البلاغ ويُدخل بياناته · Starts the report"
            url={res.partyA.url}
            onCopy={copy}
            primary
          />
          {scenario?.showB && (
            <LinkCard
              title="رابط الطرف الثاني · Party B link"
              note={scenario.bNote}
              url={res.partyB.url}
              onCopy={copy}
            />
          )}
          <div className="mt-1 flex items-center justify-between">
            <a
              href={`/dashboard/${res.reportId}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
            >
              <LayoutDashboard className="size-4" />
              لوحة المتابعة · Dashboard
            </a>
            <button
              onClick={() => { setRes(null); setScenario(null); }}
              className="text-sm text-muted-foreground hover:text-primary"
            >
              تجربة سيناريو آخر · Try another
            </button>
          </div>
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
