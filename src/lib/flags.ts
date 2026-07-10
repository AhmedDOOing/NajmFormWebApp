import type { Flag, RoutingOutcome } from "./types";

// --------------------------------------------------------------------------
// Edge-case flags (eTraffic model). Flags are set where the event happens
// (submit / ack routes); this module owns the routing precedence + the
// bilingual UI metadata. Flags are applied, not merely shown: each one
// drives routing (see routeOutcome + FLAG_META below).
// --------------------------------------------------------------------------

// Routing precedence: INJURY highest (emergency), then anything that needs a
// human, else automatic. POLICE_REPORT stays in the RoutingOutcome type — the
// manual-review queue escalates disputes to police per policy.
const EMERGENCY: Flag[] = ["INJURY"];
const MANUAL: Flag[] = [
  "FAULT_DISPUTED",
  "AFFECTED_TIMEOUT",
  "AFFECTED_LOOKUP_FAILED",
  // AI photo-analysis signals — assistive; always land in the human queue.
  "AI_FAULT_MISMATCH",
  "AI_DAMAGE_INCONSISTENT",
];

export function routeOutcome(flags: string[]): RoutingOutcome {
  const set = new Set(flags);
  if (EMERGENCY.some((f) => set.has(f))) return "EMERGENCY";
  if (MANUAL.some((f) => set.has(f))) return "MANUAL_REVIEW";
  return "AUTOMATIC";
}

// Per-flag metadata for UI (bilingual label + routing note).
export const FLAG_META: Record<
  Flag,
  { severity: "critical" | "warn" | "info"; en: string; ar: string; outcome: string }
> = {
  INJURY: {
    severity: "critical",
    en: "Injuries reported",
    ar: "إصابات مُبلّغ عنها",
    outcome: "Emergency: call 997 + traffic police. Not a standard claim.",
  },
  LINK_EXPIRED: {
    severity: "info",
    en: "Link expired / opened late",
    ar: "انتهت صلاحية الرابط",
    outcome: "Recovery page: request a fresh link.",
  },
  LOC_MANUAL: {
    severity: "info",
    en: "Location entered manually (GPS failed)",
    ar: "أُدخل الموقع يدويًا",
    outcome: "Manual city/district/landmark accepted.",
  },
  PHOTO_PENDING: {
    severity: "info",
    en: "Photos outstanding",
    ar: "الصور معلّقة",
    outcome: "Submit accepted; photo reminder scheduled.",
  },
  FAULT_DISPUTED: {
    severity: "critical",
    en: "Affected party rejected the fault admission",
    ar: "الطرف المتضرر لم يوافق على إقرار المتسبب",
    outcome: "Block auto-completion → manual review / police escalation.",
  },
  AFFECTED_TIMEOUT: {
    severity: "warn",
    en: "Affected party didn't respond in time",
    ar: "الطرف المتضرر لم يستجب خلال المهلة",
    outcome: "Report held; escalate — the admission was never acknowledged.",
  },
  AFFECTED_LOOKUP_FAILED: {
    severity: "warn",
    en: "Affected party couldn't be looked up",
    ar: "تعذّر التحقق من بيانات الطرف المتضرر",
    outcome: "Added via declared fallback → manual review.",
  },
  PROPERTY_ONLY: {
    severity: "info",
    en: "Property-only accident (no other driver)",
    ar: "حادث ممتلكات فقط (لا يوجد طرف آخر)",
    outcome: "Completes on the causer's submission + declaration.",
  },
  AI_FAULT_MISMATCH: {
    severity: "warn",
    en: "AI review: photos may not match the fault admission",
    ar: "مراجعة مبدئية: الصور قد لا تطابق إقرار المتسبب",
    outcome:
      "Preliminary AI signal — NOT a verdict. Route to a human reviewer; never overrides the causer's admission.",
  },
  AI_DAMAGE_INCONSISTENT: {
    severity: "warn",
    en: "AI review: damage looks inconsistent with the account",
    ar: "مراجعة مبدئية: الأضرار قد لا تتسق مع الرواية",
    outcome:
      "Preliminary AI signal — NOT a verdict. Route to a human reviewer to check the discrepancy.",
  },
};

export function mergeFlags(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}
