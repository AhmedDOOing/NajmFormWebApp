"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { AccidentData, Locale, PartyData, PhotoAnalysis } from "@/lib/types";
import { dict, type Lang, type Dict } from "@/lib/i18n";
import { setLangCookie } from "@/lib/locale";
import {
  VEHICLE_NATIONALITIES,
  REGISTRATION_TYPES,
  IDENTITY_TYPES,
} from "@/lib/etraffic";
import LanguageGate from "./LanguageGate";
import LocationStep, { type LocationValue } from "./LocationStep";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Check,
  CheckCircle2,
  Copy,
  ShieldAlert,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";

// ---- shared field helpers (module-level so inputs keep focus) --------------
function TextField({
  label,
  value,
  onChange,
  t,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  t: Dict;
  type?: string;
  inputMode?: "numeric" | "tel";
}) {
  return (
    <div>
      <Label>
        {label} <span className="text-destructive">*</span>
      </Label>
      <Input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${t.enter} ${label}`}
        className="mt-1 h-11"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  t,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  t: Dict;
}) {
  return (
    <div>
      <Label>
        {label} <span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-11">
          <SelectValue placeholder={`${t.select} ${label}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---- preliminary AI analysis card (assistive, neutral, never a verdict) ----
function AnalysisCard({
  analyzing,
  analysis,
  t,
}: {
  analyzing: boolean;
  analysis: PhotoAnalysis | null;
  t: Dict;
}) {
  if (!analyzing && !analysis) return null;
  return (
    <Card className="w-full text-start">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="font-bold">{t.aiTitle}</span>
        </div>
        <Badge variant="outline" className="mt-1 w-fit gap-1 border-amber-500/40 text-amber-500">
          <AlertTriangle className="size-3" /> {t.aiDisclaimer}
        </Badge>
      </CardHeader>
      <CardContent className="pt-1 text-sm">
        {analyzing && !analysis && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t.aiAnalyzing}
          </div>
        )}
        {analysis && (analysis.status !== "complete" || !analysis.result) && (
          <p className="text-muted-foreground">{t.aiFailed}</p>
        )}
        {analysis?.status === "complete" && analysis.result && (
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">{t.aiDamageSummary}</div>
              <p className="mt-1 leading-relaxed">{analysis.result.damageSummary}</p>
            </div>
            {analysis.result.consistency.discrepancies.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
                  <AlertTriangle className="size-3.5" /> {t.aiDiscrepancies}
                </div>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs">
                  {analysis.result.consistency.discrepancies.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.result.imageQualityIssues.length > 0 && (
              <p className="text-xs text-amber-500">⚠ {t.aiRetake}</p>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">{t.aiPerImage}</summary>
              <div className="mt-2 flex flex-col gap-2">
                {analysis.result.perImage.map((im) => (
                  <div key={im.index} className="border-t border-border pt-2 first:border-t-0">
                    <div className="font-medium">#{im.index + 1}</div>
                    <div className="text-muted-foreground">{im.description}</div>
                    {im.damageAreas.length > 0 && (
                      <div className="text-muted-foreground">• {im.damageAreas.join(", ")}</div>
                    )}
                    {im.qualityIssue && <div className="text-amber-500">⚠ {im.qualityIssue}</div>}
                  </div>
                ))}
              </div>
            </details>
            <p className="text-xs italic text-muted-foreground">
              {t.aiLimitations}: {analysis.result.limitations}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- client-side downscale before upload (keeps the AI call fast) ----------
type PhotoData = { base64: string; mediaType: string };
const MAX_EDGE = 1280;
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
async function fileToPhoto(file: File): Promise<PhotoData> {
  const dataUrl = await readDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", 0.82);
    return { base64: out.slice(out.indexOf(",") + 1), mediaType: "image/jpeg" };
  } catch {
    return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
  }
}

// ===========================================================================
// PartyFlow — the neutral, per-party report flow. Each party (A or B, decided
// by their link) fills ONLY their own section. Party A also captures the shared
// accident details + gets the Party B link to share. Party B sees Party A's
// submitted info read-only, then fills their own section. Identical form/UX for
// both (§3). No fault/liability anywhere.
// ===========================================================================

// §6: one continuous scrollable form per party (no unnecessary page changes).
// Party A keeps a short injuries "triage" gate first (a safety branch, not a
// page-turn), then everything else is one scrollable form.
// Injuries "Yes" and "not agreed" show inline on the triage page (no redirect).
type StepA = "triage" | "form" | "done";
type StepB = "form" | "done";
type Step = StepA | StepB;
type Role = "affected" | "causer";

export default function PartyFlow({
  reportId,
  slug,
  party,
  self,
  otherParty,
  accident,
  initialLang,
}: {
  reportId: string;
  slug: string;
  party: "A" | "B";
  self: PartyData;
  otherParty?: PartyData;
  accident?: AccidentData;
  initialLang: Locale | null;
}) {
  const [locale, setLocale] = useState<Locale | null>(initialLang);
  const alreadyDone = !!self.submittedAt;
  const [step, setStep] = useState<Step>(
    alreadyDone ? "done" : party === "A" ? "triage" : "form"
  );

  // own party fields (prefilled from any registered details)
  const [vNat, setVNat] = useState(self.vehicle?.nationality ?? "");
  const [vNum, setVNum] = useState(self.vehicle?.number ?? "");
  const [vReg, setVReg] = useState(self.vehicle?.registrationType ?? "");
  const [dIdType, setDIdType] = useState(self.driver?.identityType ?? "");
  const [dId, setDId] = useState(self.driver?.identityNumber ?? "");
  const [dName, setDName] = useState(self.driver?.fullName ?? "");
  const [dMobile, setDMobile] = useState(self.driver?.mobile ?? "");
  const [dEmail, setDEmail] = useState(self.driver?.email ?? "");
  const filled = vNat && vNum && vReg && dIdType && dId && dName && dMobile && dEmail;

  // accident (Party A only)
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [injuries, setInjuries] = useState<boolean | null>(null);
  const [role, setRole] = useState<Role | null>(self.declaredRole ?? null); // reporter's self-declared role (Party A triage)
  const [disagreed, setDisagreed] = useState(false); // "not agreed" — inline block
  const [loc, setLoc] = useState<LocationValue>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [otherUrl, setOtherUrl] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<string>(alreadyDone ? "done" : "");

  if (locale === null) {
    return (
      <LanguageGate
        reportId={reportId}
        onSelect={(l) => {
          setLangCookie(reportId, party, l);
          setLocale(l);
        }}
      />
    );
  }
  const t = dict[locale];
  const setLang = (l: Lang) => {
    setLangCookie(reportId, party, l);
    setLocale(l);
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = l;
  };

  const ORDER: Step[] = party === "A" ? ["triage", "form"] : ["form"];
  const stepIndex = Math.max(0, ORDER.indexOf(step));
  const showProgress = ORDER.includes(step);
  const partyLabel = party === "A" ? t.causerCard : t.affectedCard;
  // Was the other party captured on the call? Only then do we recommend their
  // link at the end (single-party reports don't push a Party B link).
  const otherHasData = !!(
    otherParty &&
    (otherParty.vehicle?.number ||
      otherParty.driver?.identityNumber ||
      otherParty.driver?.mobile ||
      otherParty.driver?.fullName)
  );

  async function runAnalysis(imgs: PhotoData[]) {
    if (imgs.length === 0) return setAnalysis(null);
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/report/${reportId}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          images: imgs,
          context: {
            partyAVehicle: [vNum, vReg].filter(Boolean).join(" · "),
            accidentDateTime: date && time ? `${date}T${time}` : undefined,
            injuries: injuries ?? undefined,
          },
        }),
      });
      const j = await res.json();
      setAnalysis(
        res.ok && j.analysis
          ? (j.analysis as PhotoAnalysis)
          : { status: "failed", modelVersion: "none", at: "", imageCount: imgs.length }
      );
    } catch {
      setAnalysis({ status: "failed", modelVersion: "none", at: "", imageCount: imgs.length });
    } finally {
      setAnalyzing(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/report/${reportId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          party: {
            vehicle: { nationality: vNat, number: vNum, registrationType: vReg },
            driver: {
              identityType: dIdType,
              identityNumber: dId,
              fullName: dName,
              mobile: dMobile,
              email: dEmail,
            },
            declaredRole: party === "A" ? role ?? undefined : undefined,
          },
          accident:
            party === "A"
              ? {
                  dateTime: date && time ? `${date}T${time}` : undefined,
                  coordinates:
                    loc.lat != null && loc.lng != null
                      ? { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy }
                      : undefined,
                  locationSource: loc.locationSource,
                  photoCount,
                  photosPending: photoCount === 0,
                  injuries: injuries ?? undefined,
                }
              : undefined,
          consent: true,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Error");
        setBusy(false);
        return;
      }
      setOtherUrl(j.otherPartyUrl ?? null);
      setFinalStatus(j.status);
      setStep("done");
      toast.success(t.submitted);
    } finally {
      setBusy(false);
    }
  }

  const DetailsForm = (
    <div className="flex flex-col gap-4">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{t.vehicleDetails}</div>
      <SelectField label={t.vehicleNationality} value={vNat} onChange={setVNat} options={VEHICLE_NATIONALITIES} t={t} />
      <TextField label={t.vehicleNumber} value={vNum} onChange={setVNum} inputMode="numeric" t={t} />
      <SelectField label={t.registrationType} value={vReg} onChange={setVReg} options={REGISTRATION_TYPES} t={t} />
      <div className="mt-1 text-xs font-semibold uppercase text-muted-foreground">{t.driverDetails}</div>
      <SelectField label={t.identityTypeLbl} value={dIdType} onChange={setDIdType} options={IDENTITY_TYPES} t={t} />
      <TextField label={t.identityNumber} value={dId} onChange={setDId} inputMode="numeric" t={t} />
      <TextField label={t.fullNameLbl} value={dName} onChange={setDName} t={t} />
      <TextField label={t.mobileLbl} value={dMobile} onChange={setDMobile} type="tel" t={t} />
      <TextField label={t.emailLbl} value={dEmail} onChange={setDEmail} type="email" t={t} />
    </div>
  );

  const ConsentRow = (
    <label className="mt-1 flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0" />
      <span className="text-sm text-muted-foreground">{t.consent}</span>
    </label>
  );

  return (
    <div className="min-h-[100dvh] pb-32">
      {/* header */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-xs text-muted-foreground">{reportId}</div>
            <div className="truncate text-sm font-bold">{partyLabel}</div>
          </div>
          <div className="lang-seg" role="group" aria-label="language">
            <button className={locale === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
            <button className={locale === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
          </div>
        </div>
        {showProgress && <Progress value={((stepIndex + 1) / ORDER.length) * 100} className="mt-3 h-1.5" />}
      </div>

      <div className="mx-auto max-w-md px-4 py-5 sm:max-w-xl sm:px-6">
        {/* ---- Party A: injuries triage ---- */}
        {step === "triage" && (
          <div className="flex flex-col gap-4">
            <Card className="border-t-4 border-t-primary">
              <CardContent className="pt-5 text-sm leading-relaxed text-muted-foreground">
                {t.triageBanner}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><span className="font-bold">{t.injuriesQ}</span></CardHeader>
              <CardContent className="flex gap-3">
                {[{ v: false, l: t.no }, { v: true, l: t.yes }].map((o) => (
                  <button
                    key={String(o.v)}
                    onClick={() => setInjuries(o.v)}
                    className={`flex-1 rounded-xl border p-3 text-center text-sm font-medium transition ${
                      injuries === o.v ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    {injuries === o.v && <Check className="mx-auto mb-1 size-5 text-primary" />}
                    {o.l}
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Injuries = Yes → inline emergency block on the same page (no redirect). */}
            {injuries === true && (
              <Card className="border-t-4 border-t-destructive">
                <CardContent className="flex flex-col items-center gap-3 pt-5 text-center">
                  <ShieldAlert className="size-10 text-destructive" />
                  <span className="font-bold">{t.injuryBlockTitle}</span>
                  <p className="text-sm text-muted-foreground">{t.injuryBlockBody}</p>
                  <Button asChild variant="destructive" className="h-14 w-full rounded-2xl text-base font-bold">
                    <a href="tel:911">{t.call911}</a>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Which driver is reporting — hidden when injuries=Yes (call-only). */}
            {injuries !== true && (
              <Card>
                <CardHeader className="pb-2"><span className="font-bold">{t.whichDriverQ}</span></CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => { setRole("affected"); setDisagreed(false); }}
                      className={`rounded-xl border p-3 text-center text-sm font-medium transition ${role === "affected" ? "border-sky-500 bg-sky-500/10" : "border-border"}`}
                    >
                      {role === "affected" && <Check className="mx-auto mb-1 size-5 text-sky-400" />}
                      {t.driverAffected}
                    </button>
                    <button
                      onClick={() => { setRole("causer"); setDisagreed(false); }}
                      className={`rounded-xl border p-3 text-center text-sm font-medium transition ${role === "causer" ? "border-amber-500 bg-amber-500/10" : "border-border"}`}
                    >
                      {role === "causer" && <Check className="mx-auto mb-1 size-5 text-amber-400" />}
                      {t.driverCauser}
                    </button>
                  </div>
                  <button
                    onClick={() => { setRole(null); setDisagreed(true); }}
                    className={`rounded-xl border p-3 text-center text-sm font-medium text-destructive transition hover:bg-destructive/10 ${disagreed ? "border-destructive bg-destructive/10" : "border-destructive/50"}`}
                  >
                    {disagreed && <Check className="mx-auto mb-1 size-5 text-destructive" />}
                    {t.notAgreed}
                  </button>
                  {/* Not agreed → inline notice on the same page (requires agreement). */}
                  {disagreed && (
                    <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                      <div>
                        <div className="font-semibold">{t.disagreeBlockTitle}</div>
                        <div className="text-destructive/90">{t.disagreeBlockBody}</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ---- one continuous scrollable form (§6), sectioned by cards ---- */}
        {step === "form" && (
          <div className="flex flex-col gap-5">
            {/* Party B: read-only view of Party A + shared accident */}
            {party === "B" && (
              <>
                <h1 className="text-2xl font-extrabold tracking-tight">{t.reportTitle}</h1>
                {otherParty?.submittedAt ? (
                  <Card className="border-t-4 border-t-amber-500">
                    <CardHeader className="pb-2"><span className="text-sm font-bold text-amber-500">{t.partyAReadonly}</span></CardHeader>
                    <CardContent className="text-sm">
                      <div className="grid grid-cols-2 gap-y-1">
                        <span className="text-muted-foreground">{t.vehicleNumber}</span><span className="font-medium">{otherParty.vehicle?.number ?? "—"}</span>
                        <span className="text-muted-foreground">{t.registrationType}</span><span className="font-medium">{otherParty.vehicle?.registrationType ?? "—"}</span>
                        <span className="text-muted-foreground">{t.fullNameLbl}</span><span className="font-medium">{otherParty.driver?.fullName ?? "—"}</span>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card><CardContent className="pt-5 text-sm text-muted-foreground">{t.awaitingOther}</CardContent></Card>
                )}
                {accident?.dateTime && (
                  <Card>
                    <CardHeader className="pb-2"><span className="text-sm font-bold">{t.accidentReadonly}</span></CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {accident.dateTime}
                      {accident.coordinates ? ` · ${accident.coordinates.lat.toFixed(4)}, ${accident.coordinates.lng.toFixed(4)}` : ""}
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* own section — identical form for A and B */}
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">{partyLabel}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.yourSectionSub}</p>
            </div>
            <Card className={`border-t-4 ${party === "A" ? "border-t-amber-500" : "border-t-sky-500"}`}>
              <CardContent className="pt-5">{DetailsForm}</CardContent>
            </Card>

            {/* Party A also captures the shared accident details */}
            {party === "A" && (
              <>
                <h2 className="text-xl font-extrabold tracking-tight">{t.accidentDetailsTitle}</h2>
                <Card>
                  <CardContent className="flex flex-col gap-4 pt-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>{t.accidentDateLbl}</Label>
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
                      </div>
                      <div>
                        <Label>{t.accidentTimeLbl}</Label>
                        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label className="mb-1 block">{t.accidentPhotos}</Label>
                      <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                        📷 {photoCount ? `✓ ${photoCount}` : t.addPhotosNow}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          className="hidden"
                          onChange={async (e) => {
                            const files = Array.from(e.target.files ?? []).slice(0, 6);
                            setPhotoCount(files.length);
                            if (!files.length) { setPhotos([]); setAnalysis(null); return; }
                            const imgs = await Promise.all(files.map(fileToPhoto));
                            setPhotos(imgs);
                            void runAnalysis(imgs);
                          }}
                        />
                      </label>
                      <div className="mt-3"><AnalysisCard analyzing={analyzing} analysis={analysis} t={t} /></div>
                    </div>
                    <div>
                      <Label className="mb-2 block">{t.coordinatesLbl}</Label>
                      <LocationStep lang={locale} t={t} value={loc} onSet={(k, v) => setLoc((p) => ({ ...p, [k]: v }))} onLocation={() => {}} />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {ConsentRow}
          </div>
        )}

        {/* ---- done ---- */}
        {step === "done" && (
          <div className="animate-fade-up flex flex-col items-center gap-6 pt-8 text-center">
            <CheckCircle2 className="size-16 text-primary" />
            <div>
              <h1 className="text-2xl font-extrabold">{finalStatus === "complete" ? t.reportComplete : t.submitted}</h1>
              <p className="mt-2 text-muted-foreground">
                {finalStatus === "complete"
                  ? t.bothDone
                  : party === "A" && otherHasData
                  ? t.reportFiledBody
                  : t.reportFiledSolo}
              </p>
              {finalStatus === "escalated" && (
                <Badge variant="destructive" className="mt-3 gap-1"><ShieldAlert className="size-3" /> {finalStatus}</Badge>
              )}
            </div>
            {party === "A" && otherHasData && otherUrl && finalStatus !== "complete" && (
              <Card className="w-full text-start">
                <CardContent className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">{t.ackLinkLabel}</div>
                    <a href={otherUrl} className="block truncate font-mono text-xs text-primary">{otherUrl}</a>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard?.writeText(otherUrl); toast.success(t.copied); }}>
                    <Copy className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            )}
            <span className="font-mono text-xs text-muted-foreground">{reportId}</span>
          </div>
        )}
      </div>

      {/* sticky footer nav */}
      {showProgress && !(step === "triage" && injuries === true) && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-background to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-md items-center gap-3 sm:max-w-xl">
            {stepIndex > 0 && (
              <Button
                variant="outline"
                size="lg"
                className="h-14"
                onClick={() => setStep(ORDER[stepIndex - 1])}
              >
                {t.back}
              </Button>
            )}
            {step === "triage" && (
              <Button size="lg" disabled={injuries !== false || role === null} className="cta-premium h-14 flex-1 rounded-2xl text-base font-bold" onClick={() => setStep("form")}>
                {t.next} <ChevronLeft className="size-5 ltr:rotate-180" />
              </Button>
            )}
            {step === "form" && (
              <Button size="lg" disabled={!filled || !consent || busy} className="cta-premium h-14 flex-1 rounded-2xl text-base font-bold" onClick={submit}>
                {busy ? t.submitting : t.submitReport}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
