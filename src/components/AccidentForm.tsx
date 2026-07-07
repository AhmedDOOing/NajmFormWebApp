"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Party, Prefill, SubmitPayload } from "@/lib/types";
import { dict, type Lang, type Dict } from "@/lib/i18n";
import { computeFlags, FLAG_META } from "@/lib/flags";
import type { Flag } from "@/lib/types";
import { setLangCookie } from "@/lib/locale";
import { useReportSocket } from "./useReportSocket";
import LocationStep from "./LocationStep";

type Answers = SubmitPayload;
type StepId = "injury" | "location" | "details" | "photos" | "confirm";
type Opt = [string | boolean, string];

const STEPS: StepId[] = ["injury", "location", "details", "photos", "confirm"];

export default function AccidentForm({
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
  initialLang: Lang;
}) {
  // Language is chosen at the gate (or restored from the cookie) and passed in.
  // The in-form header toggle can still change it afterward.
  const [lang, setLangState] = useState<Lang>(initialLang);
  const t = dict[lang];
  const dir = t.dir;

  const { presence, syncComplete, timedOut, serverFlags, setStatus, sendLocation, sendLang } =
    useReportSocket(reportId, party, slug, lang);

  const setLang = (l: Lang) => {
    setLangState(l);
    setLangCookie(reportId, party, l); // persist the switch too
    sendLang(l); // reflect on the dashboard
  };

  // Flip the real <html> lang/dir so the whole document (and screen readers)
  // follow the choice.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [showMore, setShowMore] = useState(false);
  const filledOnce = useRef(false);

  const [a, setA] = useState<Answers>({ ...prefill, statement: "", consent: false });

  function set<K extends keyof Answers>(k: K, v: Answers[K]) {
    if (!filledOnce.current) {
      filledOnce.current = true;
      setStatus("filling");
    }
    setA((prev) => ({ ...prev, [k]: v }));
  }

  const stepId = STEPS[step];
  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));
  const advanceSoon = () => setTimeout(goNext, 240);

  // Fields captured on the call -> "from the call" tag.
  const agentFields = useMemo(() => {
    const explicit = prefill._agentFilledFields;
    if (explicit?.length) return new Set(explicit);
    const s = new Set<string>();
    for (const [k, v] of Object.entries(prefill)) {
      if (k.startsWith("_")) continue;
      if (v !== undefined && v !== null && v !== "") s.add(k);
    }
    return s;
  }, [prefill]);

  const liveFlags = useMemo(() => {
    const own = computeFlags(a);
    return [...new Set([...(serverFlags ?? initialFlags), ...own])];
  }, [a, serverFlags, initialFlags]);

  // Only surface flags that change what the driver must DO (critical/warn).
  const userFlags = liveFlags.filter(
    (f) => FLAG_META[f as Flag] && FLAG_META[f as Flag].severity !== "info"
  );

  // ---- segmented option sets ----------------------------------------------
  const OPTS: Record<string, Opt[]> = {
    otherPartyStatus: [
      ["present", t.op_present],
      ["fled", t.op_fled],
      ["parked", t.op_parked],
      ["none", t.op_none],
    ],
    damageSeverity: [
      ["minor", t.dmg_minor],
      ["moderate", t.dmg_moderate],
      ["severe", t.dmg_severe],
    ],
    notOwner: [
      [false, t.no],
      [true, t.yes],
    ],
  };

  type RowType = "text" | "tel" | "date" | "number" | "textarea" | "seg" | "bool";
  interface Row {
    key: keyof Answers;
    group: string;
    label: string;
    type: RowType;
    req?: boolean;
  }
  // Lean field set — only what a stressed driver truly needs. Licence, vehicle
  // type, registration and insurance fields were removed from the form; any such
  // values the voice agent already captured still flow through prefill + routing.
  const ROWS: Row[] = [
    { key: "fullName", group: "you", label: t.fullName, type: "text", req: true },
    { key: "nationalId", group: "you", label: t.nationalId, type: "text", req: true },
    { key: "mobile", group: "you", label: t.mobile, type: "tel", req: true },
    { key: "nationality", group: "you", label: t.nationality, type: "text" },
    { key: "notOwner", group: "you", label: t.notOwner, type: "bool" },
    { key: "ownerName", group: "you", label: t.ownerName, type: "text" },
    { key: "plate", group: "vehicle", label: t.plate, type: "text", req: true },
    { key: "makeModel", group: "vehicle", label: t.makeModel, type: "text" },
    { key: "colour", group: "vehicle", label: t.colour, type: "text" },
    { key: "description", group: "accident", label: t.description, type: "textarea" },
    { key: "otherPartyStatus", group: "other", label: t.otherPartyStatus, type: "seg", req: true },
    { key: "otherPartyMobile", group: "other", label: t.otherPartyMobile, type: "tel" },
  ];
  const GROUPS: [string, string][] = [
    ["you", t.grpYou],
    ["vehicle", t.grpVehicle],
    ["accident", t.grpAccident],
    ["other", t.grpOther],
  ];

  const hasVal = (k: keyof Answers) => {
    const v = a[k];
    return v !== undefined && v !== null && v !== "";
  };
  const requiredComplete = ROWS.filter((r) => r.req).every((r) => hasVal(r.key));

  function humanVal(row: Row): string {
    const v = a[row.key];
    if (row.type === "bool") return v ? t.yes : t.no;
    if (row.type === "seg") {
      const found = OPTS[row.key as string]?.find((o) => o[0] === v);
      return found ? found[1] : String(v);
    }
    return String(v);
  }

  const openEdit = (k: string) =>
    setEditing((s) => new Set(s).add(k));
  const closeEdit = (k: string) =>
    setEditing((s) => {
      const n = new Set(s);
      n.delete(k);
      return n;
    });

  // rows a driver hasn't been asked about but that we conditionally hide
  const rowVisible = (r: Row) => {
    if (r.key === "otherPartyMobile" && a.otherPartyStatus === "none") return false;
    if (r.key === "ownerName" && !a.notOwner) return false;
    if (r.key === "notOwner") return showMore || a.notOwner;
    return r.req || hasVal(r.key) || showMore;
  };

  // ---- submit --------------------------------------------------------------
  async function submit() {
    setError(null);
    setBusy(true);
    const payload = { ...a, consent: true }; // the button IS the affirmation
    try {
      const res = await fetch(`/api/report/${reportId}/party/${party}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, answers: payload }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Error ${res.status}`);
        setBusy(false);
        return;
      }
      setStatus("submitted");
      setSubmitted(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- location ------------------------------------------------------------
  // A location is "chosen" once GPS coords, a picked place, or a manual entry
  // exists — this gates the footer Next (the step does NOT auto-advance; the
  // driver should see the confirmed pin first).
  const locationChosen =
    a.lat != null ||
    !!a.locationLabel ||
    (!!a.locationManual && !!(a.city || a.district || a.landmark));

  // =========================================================================
  const other: Party = party === "A" ? "B" : "A";
  const presLabel: Record<string, string> = {
    connected: t.p_connected,
    filling: t.p_filling,
    submitted: t.p_submitted,
    absent: timedOut && other === "B" ? t.p_absent : t.p_waiting,
  };

  if (submitted) {
    return (
      <SubmittedScreen
        t={t}
        dir={dir}
        reportId={reportId}
        party={party}
        syncComplete={syncComplete}
        userFlags={userFlags}
        lang={lang}
      />
    );
  }

  // ---- alert banner (only if action-changing flags present) ----------------
  const AlertBanner = () =>
    userFlags.length === 0 ? null : (
      <div className={`alert-banner ${userFlags.some((f) => FLAG_META[f as Flag].severity === "critical") ? "critical" : "warn"}`}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <div>
          {userFlags.slice(0, 2).map((f) => (
            <div key={f}>
              <b>{lang === "ar" ? FLAG_META[f as Flag].ar : FLAG_META[f as Flag].en}</b>
              <span>{FLAG_META[f as Flag].outcome}</span>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className="wiz" dir={dir} lang={lang}>
      <div className="wiz-top">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
            {reportId} · {t.party} {party}
          </div>
          <div className="lang-seg" role="group" aria-label="Language / اللغة">
            <button
              className={lang === "ar" ? "active" : ""}
              onClick={() => setLang("ar")}
              aria-pressed={lang === "ar"}
            >
              العربية
            </button>
            <button
              className={lang === "en" ? "active" : ""}
              onClick={() => setLang("en")}
              aria-pressed={lang === "en"}
            >
              English
            </button>
          </div>
        </div>
        <div className="progress">
          {STEPS.map((_, i) => (
            <div key={i} className={`seg ${i < step ? "done" : i === step ? "current" : ""}`} />
          ))}
        </div>
        <div className="mini-presence">
          <span className="mp">
            <span className={`dot ${presence[other]}`} />
            {t.party} {other}: {presLabel[presence[other]]}
          </span>
        </div>
      </div>

      <div className="wiz-body" key={stepId}>
        {/* -------- STEP: injury / safety -------- */}
        {stepId === "injury" && (
          <>
            {a.injuries ? (
              <div className="emergency">
                <div className="badge">🚑</div>
                <h1 className="step-h" style={{ color: "var(--critical)" }}>
                  {t.safetyFirst}
                </h1>
                <p className="step-sub">{t.emergencyNote}</p>
                <a className="call-btn" href="tel:997">
                  📞 {t.call997}
                </a>
                <button className="btn-primary wide" onClick={goNext}>
                  {t.emergencyContinue}
                </button>
              </div>
            ) : (
              <>
                <p className="step-sub" style={{ marginBottom: 4 }}>{t.calmIntro}</p>
                <h1 className="step-h">{t.injuryQBig}</h1>
                <p className="step-sub">{t.injuryHelp}</p>
                <div className="choices">
                  <button
                    className="choice"
                    onClick={() => {
                      set("injuries", false);
                      advanceSoon();
                    }}
                  >
                    <span className="ico">✅</span> {t.injuryNo}
                  </button>
                  <button
                    className="choice danger"
                    onClick={() => set("injuries", true)}
                  >
                    <span className="ico">🚑</span> {t.injuryYes}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* -------- STEP: location (WhatsApp-style picker) -------- */}
        {stepId === "location" && (
          <>
            <h1 className="step-h">{t.whereTitle}</h1>
            <p className="step-sub">{t.whereHelp}</p>
            <LocationStep
              lang={lang}
              t={t}
              value={a}
              onSet={(k, v) => set(k as keyof Answers, v as never)}
              onLocation={(loc) => sendLocation(loc)}
            />
          </>
        )}

        {/* -------- STEP: details (confirm / minimal entry) -------- */}
        {stepId === "details" && (
          <>
            <h1 className="step-h">{agentFields.size > 2 ? t.reviewTitle : t.detailsTitle}</h1>
            <p className="step-sub">{agentFields.size > 2 ? t.reviewSub : t.detailsSub}</p>
            <AlertBanner />
            {GROUPS.map(([gid, glabel]) => {
              const rows = ROWS.filter((r) => r.group === gid && rowVisible(r));
              if (rows.length === 0) return null;
              return (
                <div className="review-grp" key={gid}>
                  <h3>{glabel}</h3>
                  {rows.map((row) => {
                    const key = row.key as string;
                    const isEditing = editing.has(key);
                    const has = hasVal(row.key);
                    // Prefilled + not editing -> compact confirm row (tap to edit).
                    if (has && !isEditing) {
                      return (
                        <div className="crow" key={key}>
                          <div className="cinfo">
                            <div className="clabel">
                              {row.label}
                              {agentFields.has(key) && <span className="tag">{t.fromCall}</span>}
                            </div>
                            <div className="cval">{humanVal(row)}</div>
                          </div>
                          <span className="cok">✓</span>
                          <button className="editlink" onClick={() => openEdit(key)}>
                            {t.edit}
                          </button>
                        </div>
                      );
                    }
                    // Empty (or actively editing) -> input shown directly, no extra
                    // tap. Empty inputs stay open after the first keystroke.
                    return (
                      <EditPanel
                        key={key}
                        row={row}
                        value={a[row.key]}
                        opts={OPTS[key]}
                        t={t}
                        inline={!isEditing}
                        onText={(v) => {
                          set(row.key, v as never);
                          if (!isEditing) openEdit(key);
                        }}
                        onPick={(v) => {
                          set(row.key, v as never);
                          closeEdit(key);
                        }}
                        onDone={() => closeEdit(key)}
                      />
                    );
                  })}
                </div>
              );
            })}
            <button className="more-toggle" onClick={() => setShowMore((s) => !s)}>
              {showMore ? "▴" : "▾"} {t.moreDetails}
            </button>
          </>
        )}

        {/* -------- STEP: photos -------- */}
        {stepId === "photos" && (
          <>
            <h1 className="step-h">{t.photosTitleBig}</h1>
            <p className="step-sub">{t.photosHint}</p>
            <label className="loc-big" style={{ cursor: "pointer" }}>
              <span className="big-ico">📷</span>
              {a.photoCount ? `✓ ${a.photoCount}` : t.addPhotosNow}
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => set("photoCount", e.target.files?.length ?? 0)}
              />
            </label>
          </>
        )}

        {/* -------- STEP: confirm & submit -------- */}
        {stepId === "confirm" && (
          <>
            <h1 className="step-h">{t.reviewAndSend}</h1>
            <AlertBanner />
            <div className="field" style={{ marginTop: 8 }}>
              <label>{t.statementOptional}</label>
              <textarea value={a.statement ?? ""} onChange={(e) => set("statement", e.target.value)} />
            </div>
            <p className="muted">{t.consentNote}</p>
            {error && <p style={{ color: "var(--critical)" }}>{error}</p>}
          </>
        )}
      </div>

      {/* -------- sticky footer -------- */}
      <Footer
        stepId={stepId}
        step={step}
        t={t}
        busy={busy}
        locationChosen={locationChosen}
        photoCount={a.photoCount}
        requiredComplete={requiredComplete}
        injuriesAnswered={a.injuries !== undefined}
        onBack={goBack}
        onNext={goNext}
        onSkipPhotos={() => {
          set("photosPending", true);
          goNext();
        }}
        onSubmit={submit}
        showBack={step > 0 && !(stepId === "injury" && a.injuries)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Footer(props: {
  stepId: StepId;
  step: number;
  t: Dict;
  busy: boolean;
  locationChosen: boolean;
  photoCount?: number;
  requiredComplete: boolean;
  injuriesAnswered: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkipPhotos: () => void;
  onSubmit: () => void;
  showBack: boolean;
}) {
  const { stepId, t } = props;

  // The injury step advances via the big choice buttons (no footer CTA there,
  // unless the emergency panel is showing its own continue button).
  if (stepId === "injury") return null;

  let primary: React.ReactNode = null;
  if (stepId === "location") {
    primary = (
      <button className="btn-primary" disabled={!props.locationChosen} onClick={props.onNext}>
        {t.next}
      </button>
    );
  } else if (stepId === "details") {
    primary = (
      <button className="btn-primary" disabled={!props.requiredComplete} onClick={props.onNext}>
        {props.requiredComplete ? t.confirmCorrect : t.fillRequired}
      </button>
    );
  } else if (stepId === "photos") {
    primary = props.photoCount ? (
      <button className="btn-primary" onClick={props.onNext}>
        {t.confirmCorrect}
      </button>
    ) : (
      <button className="btn-primary" onClick={props.onSkipPhotos}>
        {t.later}
      </button>
    );
  } else if (stepId === "confirm") {
    primary = (
      <button className="btn-primary wide" disabled={props.busy} onClick={props.onSubmit}>
        {props.busy ? t.submitting : t.consentAgreeSubmit}
      </button>
    );
  }

  return (
    <div className="wiz-foot">
      <div className="inner">
        {props.showBack && stepId !== "confirm" && (
          <button className="btn-back" onClick={props.onBack}>
            {t.back}
          </button>
        )}
        {stepId === "confirm" && props.showBack && (
          <button className="btn-back" onClick={props.onBack}>
            {t.back}
          </button>
        )}
        {primary}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function EditPanel({
  row,
  value,
  opts,
  t,
  onText,
  onPick,
  onDone,
  inline = false,
}: {
  row: { key: string | number | symbol; label: string; type: string };
  value: unknown;
  opts?: Opt[];
  t: Dict;
  onText: (v: unknown) => void;
  onPick: (v: unknown) => void;
  onDone: () => void;
  // inline = an always-visible empty field (no "Done", no autofocus). When the
  // driver opens an existing value to edit, inline is false: focus it + show Done.
  inline?: boolean;
}) {
  const doneBtn = inline ? null : (
    <button className="btn-back" style={{ marginTop: 8 }} onClick={onDone}>
      {t.doneEdit}
    </button>
  );
  return (
    <div className="edit-panel">
      <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
        {row.label}
      </label>
      {row.type === "seg" || row.type === "bool" ? (
        <div className="toggle-row">
          {(opts ?? []).map(([val, label]) => (
            <button
              key={String(val)}
              type="button"
              className={value === val ? "active" : ""}
              onClick={() => onPick(val)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : row.type === "textarea" ? (
        <>
          <textarea value={(value as string) ?? ""} onChange={(e) => onText(e.target.value)} autoFocus={!inline} />
          {doneBtn}
        </>
      ) : (
        <>
          <input
            type={row.type === "number" ? "number" : row.type === "date" ? "date" : row.type === "tel" ? "tel" : "text"}
            value={(value as string) ?? ""}
            autoFocus={!inline}
            onChange={(e) =>
              onText(row.type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value)
            }
          />
          {doneBtn}
        </>
      )}
    </div>
  );
}

function SubmittedScreen({
  t,
  dir,
  reportId,
  party,
  syncComplete,
  userFlags,
  lang,
}: {
  t: Dict;
  dir: string;
  reportId: string;
  party: Party;
  syncComplete: boolean;
  userFlags: string[];
  lang: Lang;
}) {
  return (
    <div className="wiz" dir={dir} lang={lang}>
      <div className="wiz-body center" style={{ paddingTop: 64 }}>
        <div style={{ fontSize: 64 }}>✓</div>
        <h1 className="step-h" style={{ textAlign: "center" }}>{t.submitted}</h1>
        <p className="muted mono">{reportId} · {t.party} {party}</p>
        {syncComplete && <div className="banner ok" style={{ marginTop: 16 }}>{t.bothDone}</div>}
        {userFlags.length > 0 && (
          <div className="alert-banner warn" style={{ textAlign: "start", marginTop: 16 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              {userFlags.map((f) => (
                <div key={f}>
                  <b>{lang === "ar" ? FLAG_META[f as Flag].ar : FLAG_META[f as Flag].en}</b>
                  <span>{FLAG_META[f as Flag].outcome}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
