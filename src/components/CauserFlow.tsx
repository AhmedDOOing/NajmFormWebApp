"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { CauserData, Locale, PhotoAnalysis, PropertyItem } from "@/lib/types";
import { dict, type Lang, type Dict } from "@/lib/i18n";
import { setLangCookie } from "@/lib/locale";
import {
  VEHICLE_NATIONALITIES,
  REGISTRATION_TYPES,
  IDENTITY_TYPES,
} from "@/lib/etraffic";
import LanguageGate from "./LanguageGate";
import LocationStep, { type LocationValue } from "./LocationStep";
import AddAffectedDialog, { type AffectedEntry } from "./AddAffectedDialog";
import AddPropertyDialog from "./AddPropertyDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  ChevronLeft,
  Trash2,
  CheckCircle2,
  Check,
  Copy,
  ShieldAlert,
  User,
  Building2,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type PhotoData = { base64: string; mediaType: string };

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Downscale to a max edge + re-encode as JPEG before upload. Fewer image tokens
// + a smaller body = a much faster server-side vision call for a roadside user.
const MAX_EDGE = 1280;
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
    // Fallback: send the original bytes as-is (jpeg is the safe default type).
    return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
  }
}

// Preliminary AI photo-analysis card. Explicitly labelled as assistive/for-review
// — never a "verdict". Shown on the done screen and mirrored on the dashboard.
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

  const partyLabel = (p: string) =>
    p === "A" ? t.aiPartyA : p === "B" ? t.aiPartyB : p === "shared" ? t.aiPartyShared : t.aiPartyUndetermined;

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

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">{t.aiIndication}</span>
              <Badge variant="secondary">{partyLabel(analysis.result.faultIndication.party)}</Badge>
              <span className="text-xs text-muted-foreground">
                {t.aiConfidence}: {Math.round(analysis.result.faultIndication.confidence * 100)}%
              </span>
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
              {t.aiLimitations}: {analysis.result.faultIndication.limitations}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Step =
  | "triage"
  | "causer"
  | "home"
  | "accident"
  | "declaration"
  | "done"
  | "blocked-injury"
  | "blocked-affected";
type Role = "affected" | "causer";

export default function CauserFlow({
  reportId,
  slug,
  causer,
  initialLang,
}: {
  reportId: string;
  slug: string;
  causer: CauserData;
  initialLang: Locale | null;
}) {
  const [locale, setLocale] = useState<Locale | null>(initialLang);
  const [step, setStep] = useState<Step>("triage");
  const [role, setRole] = useState<Role | null>(null);
  // Causer details — entered by the causer (pre-filled from the call if captured).
  const [cvNationality, setCvNationality] = useState(causer.vehicle?.nationality ?? "");
  const [cvNumber, setCvNumber] = useState(causer.vehicle?.number ?? "");
  const [cvReg, setCvReg] = useState(causer.vehicle?.registrationType ?? "");
  const [cdIdType, setCdIdType] = useState(causer.driver?.identityType ?? "");
  const [cdIdNumber, setCdIdNumber] = useState(causer.driver?.identityNumber ?? "");
  const [cdName, setCdName] = useState(causer.driver?.fullName ?? "");
  const [cdMobile, setCdMobile] = useState(causer.driver?.mobile ?? "");
  const [cdEmail, setCdEmail] = useState(causer.driver?.email ?? "");
  const causerFilled =
    cvNationality && cvNumber && cvReg && cdIdType && cdIdNumber && cdName && cdMobile && cdEmail;
  const [affected, setAffected] = useState<AffectedEntry[]>([]);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [affOpen, setAffOpen] = useState(false);
  const [propOpen, setPropOpen] = useState(false);

  // accident details
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  // Actual image bytes (base64) held in memory to POST to server-side analysis.
  // Never uploaded/persisted as raw files — sent once to /analyze, then dropped.
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [injuries, setInjuries] = useState<boolean | null>(null);
  const [loc, setLoc] = useState<LocationValue>({});

  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ackUrls, setAckUrls] = useState<{ url: string; name?: string }[]>([]);
  const [finalStatus, setFinalStatus] = useState<string>("");
  // AI photo analysis (assistive) — runs after submit, shown on the done screen.
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);

  if (locale === null) {
    return (
      <LanguageGate
        reportId={reportId}
        onSelect={(l) => {
          setLangCookie(reportId, "A", l);
          setLocale(l);
        }}
      />
    );
  }
  const t = dict[locale];
  const setLang = (l: Lang) => {
    setLangCookie(reportId, "A", l);
    setLocale(l);
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = l;
  };

  const STEP_ORDER: Step[] = ["triage", "causer", "home", "accident", "declaration"];
  const stepIndex = Math.max(0, STEP_ORDER.indexOf(step));
  const showProgress = STEP_ORDER.includes(step);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/report/${reportId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          causer: {
            vehicle: { nationality: cvNationality, number: cvNumber, registrationType: cvReg },
            driver: {
              identityType: cdIdType,
              identityNumber: cdIdNumber,
              fullName: cdName,
              mobile: cdMobile,
              email: cdEmail,
            },
          },
          affected: affected.map((a) => ({
            vehicle: a.vehicle,
            driver: a.driver,
            lookupFailed: a.lookupFailed,
          })),
          properties,
          accident: {
            dateTime: date && time ? `${date}T${time}` : undefined,
            coordinates:
              loc.lat != null && loc.lng != null
                ? { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy }
                : undefined,
            locationSource: loc.locationSource,
            photoCount,
            photosPending: photoCount === 0,
            injuries: injuries ?? undefined,
          },
          faultDeclaration: true,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Error");
        setBusy(false);
        return;
      }
      setAckUrls(j.affected ?? []);
      setFinalStatus(j.status);
      setStep("done");
      toast.success(t.reportFiledTitle);
    } finally {
      setBusy(false);
    }
  }

  // Live, assistive photo analysis — runs on the accident step as soon as photos
  // are added, and renders right under the upload. It never blocks the form.
  async function runAnalysis(imgs: PhotoData[]) {
    if (imgs.length === 0) {
      setAnalysis(null);
      return;
    }
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const context = {
        causerVehicle: [cvNumber, cvReg].filter(Boolean).join(" · "),
        affectedVehicles: affected
          .map((a) => [a.vehicle.number, a.vehicle.registrationType].filter(Boolean).join(" · "))
          .filter(Boolean),
        accidentDateTime: date && time ? `${date}T${time}` : undefined,
        injuries: injuries ?? undefined,
        properties: properties.map((p) => `${p.type} (${p.ownership})`),
      };
      const res = await fetch(`/api/report/${reportId}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, images: imgs, context }),
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

  const Header = () => (
    <div className="sticky top-0 z-20 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="font-mono text-xs text-muted-foreground">
          {reportId} · {role === "affected" ? t.affectedCard : t.causerCard}
        </div>
        <div className="flex overflow-hidden rounded-full border border-border">
          <Button variant={locale === "ar" ? "default" : "ghost"} size="sm" className="h-8 rounded-none px-3 text-xs" onClick={() => setLang("ar")}>العربية</Button>
          <Button variant={locale === "en" ? "default" : "ghost"} size="sm" className="h-8 rounded-none px-3 text-xs" onClick={() => setLang("en")}>English</Button>
        </div>
      </div>
      {showProgress && <Progress value={((stepIndex + 1) / STEP_ORDER.length) * 100} className="mt-3 h-1.5" />}
    </div>
  );

  return (
    <div className="min-h-[100dvh]" dir={t.dir} lang={locale}>
      <Header />
      <div className="animate-fade-up mx-auto w-full max-w-md p-4 pb-28">
        {step === "triage" && (
          <div className="flex flex-col gap-4">
            {/* agreement / no-injuries banner */}
            <Card className="border-t-4 border-t-primary">
              <CardContent className="pt-4 text-sm leading-relaxed">
                {t.triageBanner}
              </CardContent>
            </Card>

            {/* injuries question */}
            <Card className="border-t-4 border-t-primary">
              <CardHeader className="pb-2">
                <span className="font-semibold">{t.injuriesQ}</span>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {[
                  { v: true, label: t.yes },
                  { v: false, label: t.no },
                ].map((o) => (
                  <button
                    key={String(o.v)}
                    onClick={() => setInjuries(o.v)}
                    className={`flex h-12 items-center justify-between rounded-lg border px-4 text-start ${
                      injuries === o.v ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    <span className="font-medium">{o.label}</span>
                    {injuries === o.v && <Check className="size-5 text-primary" />}
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* injuries=Yes -> the choosing section is replaced by a call button.
                injuries=No/unset -> the "which driver" selection stays. */}
            {injuries === true ? (
              <Card className="border-t-4 border-t-destructive">
                <CardContent className="flex flex-col items-center gap-4 pt-5 text-center">
                  <div className="text-4xl">🚑</div>
                  <p className="text-sm text-muted-foreground">{t.injuryBlockBody}</p>
                  <a
                    href="tel:911"
                    className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-destructive text-lg font-bold text-white"
                  >
                    📞 {t.call911}
                  </a>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-t-4 border-t-primary">
                <CardHeader className="pb-2">
                  <span className="font-semibold">{t.whichDriverQ}</span>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setRole("affected")}
                    className={`relative overflow-hidden rounded-lg border p-4 text-center ${
                      role === "affected" ? "border-sky-500 bg-sky-500/10" : "border-border"
                    }`}
                  >
                    <span className="absolute inset-x-0 top-0 h-1.5 bg-sky-500" />
                    {role === "affected" && <Check className="mx-auto mb-1 size-5 text-sky-400" />}
                    <span className="text-sm font-medium">{t.driverAffected}</span>
                  </button>
                  <button
                    onClick={() => setRole("causer")}
                    className={`relative overflow-hidden rounded-lg border p-4 text-center ${
                      role === "causer" ? "border-amber-500 bg-amber-500/10" : "border-border"
                    }`}
                  >
                    <span className="absolute inset-x-0 top-0 h-1.5 bg-amber-500" />
                    {role === "causer" && <Check className="mx-auto mb-1 size-5 text-amber-400" />}
                    <span className="text-sm font-medium">{t.driverCauser}</span>
                  </button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {step === "blocked-injury" && (
          <div className="animate-fade-up flex flex-col items-center gap-6 pt-10 text-center">
            <div className="text-5xl">🚑</div>
            <div>
              <h1 className="text-2xl font-extrabold text-destructive">{t.injuryBlockTitle}</h1>
              <p className="mt-2 text-muted-foreground">{t.injuryBlockBody}</p>
            </div>
            <a href="tel:997" className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-destructive text-lg font-bold text-white">
              📞 {t.call997}
            </a>
          </div>
        )}

        {step === "blocked-affected" && (
          <div className="animate-fade-up flex flex-col items-center gap-6 pt-10 text-center">
            <div className="text-5xl">📩</div>
            <div>
              <h1 className="text-2xl font-extrabold">{t.affectedInfoTitle}</h1>
              <p className="mt-2 text-muted-foreground">{t.affectedInfoBody}</p>
            </div>
            <Button variant="outline" size="lg" className="h-12" onClick={() => setStep("triage")}>
              {t.back}
            </Button>
          </div>
        )}

        {step === "causer" && (
          <div className="flex flex-col gap-5">
            <h1 className="text-2xl font-extrabold tracking-tight">{t.reportTitle}</h1>

            {/* Vehicle section — header reflects the reporting driver's role */}
            <Card className={`border-t-4 ${role === "affected" ? "border-t-sky-500" : "border-t-amber-500"}`}>
              <CardHeader className="pb-2">
                <span className={`font-semibold ${role === "affected" ? "text-sky-400" : "text-amber-500"}`}>
                  {role === "affected" ? t.driverAffected : t.driverCauser}
                </span>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <SelectField label={t.vehicleNationality} value={cvNationality} onChange={setCvNationality} options={[...VEHICLE_NATIONALITIES]} t={t} />
                <TextField label={t.vehicleNumber} value={cvNumber} onChange={setCvNumber} t={t} inputMode="numeric" />
                <SelectField label={t.registrationType} value={cvReg} onChange={setCvReg} options={[...REGISTRATION_TYPES]} t={t} />
              </CardContent>
            </Card>

            {/* Driver section */}
            <Card>
              <CardHeader className="pb-2">
                <span className="font-semibold">{t.driverDetails}</span>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <SelectField label={t.identityTypeLbl} value={cdIdType} onChange={setCdIdType} options={[...IDENTITY_TYPES]} t={t} />
                <TextField label={t.identityNumber} value={cdIdNumber} onChange={setCdIdNumber} t={t} inputMode="numeric" />
                <TextField label={t.fullNameLbl} value={cdName} onChange={setCdName} t={t} />
                <TextField label={t.mobileLbl} value={cdMobile} onChange={setCdMobile} t={t} type="tel" />
                <TextField label={t.emailLbl} value={cdEmail} onChange={setCdEmail} t={t} type="email" />
              </CardContent>
            </Card>
          </div>
        )}

        {step === "home" && (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-extrabold tracking-tight">{t.reportTitle}</h1>

            {/* Self card — the reporting driver's own details, in their role's spot */}
            <Card className={`overflow-hidden border-s-4 ${role === "affected" ? "border-s-sky-500" : "border-s-amber-500"}`}>
              <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
                <User className={`size-4 ${role === "affected" ? "text-sky-400" : "text-amber-500"}`} />
                <span className="font-semibold">
                  {role === "affected" ? t.affectedCard : t.causerCard}
                </span>
                <Badge variant="secondary" className="ms-auto">{t.fromCall}</Badge>
              </CardHeader>
              <CardContent className="text-sm">
                <Row label={t.vehicleNumber} value={cvNumber} />
                <Row label={t.registrationType} value={cvReg} />
                <Row label={t.fullNameLbl} value={cdName} />
                <Row label={t.identityNumber} value={cdIdNumber} />
                <button className="mt-2 text-xs text-primary" onClick={() => setStep("causer")}>
                  {t.edit}
                </button>
              </CardContent>
            </Card>

            {/* Other-party card — add the OPPOSITE role by lookup */}
            <Card className={`border-s-4 ${role === "affected" ? "border-s-amber-500" : "border-s-primary"}`}>
              <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
                <span className="font-semibold">
                  {role === "affected" ? t.causerCard : t.affectedCard}
                </span>
                <Button size="sm" variant="ghost" className="ms-auto h-8 gap-1 text-primary" onClick={() => setAffOpen(true)}>
                  <Plus className="size-4" /> {role === "affected" ? t.addCauser : t.addAffected}
                </Button>
              </CardHeader>
              <CardContent>
                {affected.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.none}</p>
                ) : (
                  affected.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 border-t border-border py-2 first:border-t-0 text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{a.driver.fullName || a.driver.identityNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.vehicleNumber} {a.vehicle.number} · {a.vehicle.registrationType || "—"}
                        </div>
                      </div>
                      {a.lookupFailed && <Badge variant="destructive" className="text-[10px]">review</Badge>}
                      <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => setAffected(affected.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Properties card */}
            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
                <Building2 className="size-4 text-muted-foreground" />
                <span className="font-semibold">{t.propertiesCard}</span>
                <Button size="sm" variant="ghost" className="ms-auto h-8 gap-1 text-primary" onClick={() => setPropOpen(true)}>
                  <Plus className="size-4" /> {t.addProperty}
                </Button>
              </CardHeader>
              <CardContent>
                {properties.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.none}</p>
                ) : (
                  properties.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 border-t border-border py-2 first:border-t-0 text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{p.type}</div>
                        <div className="text-xs text-muted-foreground">{p.ownership} · {p.address}</div>
                      </div>
                      <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => setProperties(properties.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {step === "accident" && (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-extrabold tracking-tight">{t.accidentDetailsTitle}</h1>
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
                    if (!files.length) {
                      setPhotos([]);
                      setAnalysis(null);
                      return;
                    }
                    const imgs = await Promise.all(files.map(fileToPhoto));
                    setPhotos(imgs);
                    void runAnalysis(imgs); // live analysis, shown below
                  }}
                />
              </label>
              {/* Preliminary AI analysis appears right under the upload. */}
              <div className="mt-3">
                <AnalysisCard analyzing={analyzing} analysis={analysis} t={t} />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">{t.coordinatesLbl}</Label>
              <LocationStep lang={locale} t={t} value={loc} onSet={(k, v) => setLoc((p) => ({ ...p, [k]: v }))} onLocation={() => {}} />
            </div>
          </div>
        )}

        {step === "declaration" && (
          <div className="flex flex-col gap-5">
            <h1 className="text-2xl font-extrabold tracking-tight">{t.faultTitle}</h1>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm leading-relaxed">{t.faultAccept}</p>
                <Separator className="my-4" />
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 size-5 shrink-0" />
                  <span className="text-sm font-medium">{t.consent}</span>
                </label>
              </CardContent>
            </Card>
          </div>
        )}

        {step === "done" && (
          <div className="animate-fade-up flex flex-col items-center gap-6 pt-8 text-center">
            <CheckCircle2 className="size-16 text-primary" />
            <div>
              <h1 className="text-2xl font-extrabold">{t.reportFiledTitle}</h1>
              <p className="mt-2 text-muted-foreground">
                {ackUrls.length ? t.reportFiledBody : t.reportComplete}
              </p>
              {finalStatus === "escalated" && (
                <Badge variant="destructive" className="mt-3 gap-1"><ShieldAlert className="size-3" /> {finalStatus}</Badge>
              )}
            </div>
            {ackUrls.map((a, i) => (
              <Card key={i} className="w-full text-start">
                <CardContent className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">{t.ackLinkLabel}{a.name ? ` · ${a.name}` : ""}</div>
                    <a href={a.url} className="block truncate font-mono text-xs text-primary">{a.url}</a>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard?.writeText(a.url); toast.success("Copied"); }}>
                    <Copy className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            <span className="font-mono text-xs text-muted-foreground">{reportId}</span>
          </div>
        )}
      </div>

      {/* sticky footer nav — hidden on triage when injuries=Yes (call only) */}
      {STEP_ORDER.includes(step) && !(step === "triage" && injuries === true) && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-background to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-md items-center gap-3">
            {step !== "triage" && (
              <Button
                variant="outline"
                size="lg"
                className="h-14"
                onClick={() =>
                  setStep(
                    step === "declaration"
                      ? "accident"
                      : step === "accident"
                      ? "home"
                      : step === "home"
                      ? "causer"
                      : "triage"
                  )
                }
              >
                {t.back}
              </Button>
            )}
            {step === "triage" && (
              <Button
                size="lg"
                disabled={injuries === null || role === null}
                className="cta-premium h-14 flex-1 rounded-2xl text-base font-bold"
                onClick={() => setStep("causer")}
              >
                {t.next} <ChevronLeft className="size-5 ltr:rotate-180" />
              </Button>
            )}
            {step === "causer" && (
              <Button
                size="lg"
                disabled={!causerFilled}
                className="cta-premium h-14 flex-1 rounded-2xl text-base font-bold"
                onClick={() => setStep("home")}
              >
                {t.next} <ChevronLeft className="size-5 ltr:rotate-180" />
              </Button>
            )}
            {step === "home" && (
              <Button
                size="lg"
                disabled={affected.length === 0}
                className="cta-premium h-14 flex-1 rounded-2xl text-base font-bold"
                onClick={() => setStep("accident")}
              >
                {t.next} <ChevronLeft className="size-5 ltr:rotate-180" />
              </Button>
            )}
            {step === "accident" && (
              <Button size="lg" className="cta-premium h-14 flex-1 rounded-2xl text-base font-bold" onClick={() => setStep("declaration")}>
                {t.next} <ChevronLeft className="size-5 ltr:rotate-180" />
              </Button>
            )}
            {step === "declaration" && (
              <Button size="lg" disabled={!accepted || busy} className="cta-premium h-14 flex-1 rounded-2xl text-base font-bold" onClick={submit}>
                {busy ? t.submitting : t.submitReport}
              </Button>
            )}
          </div>
        </div>
      )}

      <AddAffectedDialog
        lang={locale}
        title={role === "affected" ? t.addCauser : t.addAffected}
        open={affOpen}
        onOpenChange={setAffOpen}
        onAdd={(e) => setAffected((p) => [...p, e])}
      />
      <AddPropertyDialog lang={locale} open={propOpen} onOpenChange={setPropOpen} onAdd={(p) => setProperties((prev) => [...prev, p])} />
    </div>
  );
}

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
  inputMode?: "numeric" | "tel" | "text";
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
  options: string[];
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

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
