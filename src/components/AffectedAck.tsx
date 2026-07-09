"use client";

import { useState } from "react";
import type { AckStatus, Locale, VehicleInfo, PropertyItem } from "@/lib/types";
import { dict } from "@/lib/i18n";
import { setLangCookie } from "@/lib/locale";
import LanguageGate from "./LanguageGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check, X, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";

export interface AckSummary {
  causerVehicle: VehicleInfo;
  affectedVehicle: VehicleInfo;
  accident: { locationText?: string; dateTime?: string; area?: string };
  properties: PropertyItem[];
}

export default function AffectedAck({
  ackSlug,
  reportId,
  initialLang,
  ackStatus,
  summary,
}: {
  ackSlug: string;
  reportId: string;
  initialLang: Locale | null;
  ackStatus: AckStatus;
  summary: AckSummary;
}) {
  const [locale, setLocale] = useState<Locale | null>(initialLang);
  const [status, setStatus] = useState<AckStatus>(ackStatus);
  const [busy, setBusy] = useState(false);

  if (locale === null) {
    return (
      <LanguageGate
        reportId={reportId}
        onSelect={(l) => {
          setLangCookie(reportId, "B", l);
          setLocale(l);
        }}
      />
    );
  }
  const t = dict[locale];

  async function decide(decision: "accept" | "reject") {
    setBusy(true);
    try {
      const res = await fetch(`/api/ack/${ackSlug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) setStatus(decision === "accept" ? "accepted" : "rejected");
    } finally {
      setBusy(false);
    }
  }

  if (status !== "pending") {
    const accepted = status === "accepted";
    return (
      <div className="p-safe flex min-h-[100dvh] items-center justify-center" dir={t.dir} lang={locale}>
        <div className="animate-fade-up flex max-w-sm flex-col items-center gap-5 text-center">
          {accepted ? <CheckCircle2 className="size-16 text-primary" /> : <XCircle className="size-16 text-destructive" />}
          <p className="text-lg font-semibold">{accepted ? t.ackAcceptedMsg : t.ackRejectedMsg}</p>
          <span className="font-mono text-xs text-muted-foreground">{reportId}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh]" dir={t.dir} lang={locale}>
      <div className="animate-fade-up mx-auto w-full max-w-md p-4 pb-32">
        <div className="mb-4 flex flex-col items-center gap-3 pt-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/najm-logo.svg" alt="نجم" className="h-14 w-auto" />
          <h1 className="text-xl font-extrabold tracking-tight">{t.ackTitle}</h1>
        </div>

        <Card className="border-primary/40">
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
            <ShieldCheck className="size-4 text-primary" />
            <span className="text-sm font-semibold">{t.ackIntro}</span>
          </CardHeader>
          <CardContent className="text-sm">
            <Row label={`${t.causerAdmits} · ${t.vehicleNumber}`} value={summary.causerVehicle?.number} />
            <Row label={`${t.affectedCard} · ${t.vehicleNumber}`} value={summary.affectedVehicle?.number} />
            <Separator className="my-2" />
            <Row label={t.area} value={summary.accident?.area} />
            <Row label={t.locationTextLbl} value={summary.accident?.locationText} />
            <Row label={t.accidentDateLbl} value={summary.accident?.dateTime?.replace("T", " ")} />
            {summary.properties?.length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="text-xs font-semibold uppercase text-muted-foreground">{t.propertiesCard}</div>
                {summary.properties.map((p, i) => (
                  <div key={i} className="text-xs text-muted-foreground">{p.type} · {p.ownership}</div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <p className="mt-3 text-center text-xs text-muted-foreground">{reportId}</p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-background to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-md gap-3">
          <Button variant="outline" size="lg" disabled={busy} className="h-14 flex-1 border-destructive/60 text-destructive hover:bg-destructive/10" onClick={() => decide("reject")}>
            <X className="size-5" /> {t.ackReject}
          </Button>
          <Button size="lg" disabled={busy} className="cta-premium h-14 flex-1 rounded-2xl text-base font-bold" onClick={() => decide("accept")}>
            <Check className="size-5" /> {t.ackAccept}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end font-medium">{value || "—"}</span>
    </div>
  );
}
