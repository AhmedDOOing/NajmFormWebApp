import type { Flag, RoutingOutcome, SubmitPayload } from "./types";

// --------------------------------------------------------------------------
// Edge-case flag computation (build brief §7). These are applied, not merely
// shown: each flag drives routing (see routeOutcome + FLAG_META below).
// `now` is injected so callers control the clock (and tests are deterministic).
// --------------------------------------------------------------------------

export function computeFlags(p: SubmitPayload, now: Date = new Date()): Flag[] {
  const flags = new Set<Flag>();

  // Injuries — overrides everything (emergency).
  if (p.injuries) flags.add("INJURY");

  // Other party status branches.
  switch (p.otherPartyStatus) {
    case "fled":
      flags.add("HIT_AND_RUN");
      break;
    case "parked":
      flags.add("PARKED_HIT");
      break;
    case "none":
      flags.add("SINGLE_VEHICLE");
      break;
  }

  // Insurance.
  if (
    p.insuranceStatus === "expired" ||
    p.insuranceStatus === "none" ||
    p.insuranceStatus === "unknown"
  ) {
    flags.add("UNINSURED");
  }

  // Registration.
  if (p.registrationStatus === "expired") flags.add("REG_VIOLATION");

  // Licence — expired date or explicitly missing.
  if (p.licenceExpiry) {
    const exp = new Date(p.licenceExpiry);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < now.getTime()) {
      flags.add("LICENCE_INVALID");
    }
  }
  if (p.licenceNo === "" || p.licenceNo === "none") flags.add("LICENCE_INVALID");

  // Driver != owner.
  if (p.notOwner) flags.add("OWNER_MISMATCH");

  // Special vehicle types require extra docs.
  if (
    p.vehicleType === "rental" ||
    p.vehicleType === "commercial" ||
    p.vehicleType === "government" ||
    p.vehicleType === "motorcycle"
  ) {
    flags.add("SPECIAL_VEHICLE");
  }

  // 3+ vehicles -> beyond the two-party flow.
  if (typeof p.vehiclesInvolved === "number" && p.vehiclesInvolved >= 3) {
    flags.add("MULTI_VEHICLE");
  }

  // Location entered by hand (GPS failed).
  if (p.locationManual) flags.add("LOC_MANUAL");

  // Photos deferred.
  if (p.photosPending) flags.add("PHOTO_PENDING");

  // Identity verification failed at submit time.
  if (p.identityVerified === false) flags.add("PARTY_B_UNVERIFIED");

  // Party B disputes a shared fact from A's account.
  if (p.sharedDispute) flags.add("SHARED_DISPUTE");

  return [...flags];
}

// Routing precedence (brief §7): INJURY/HIT_AND_RUN highest, then police-path,
// then manual review, else automatic.
const EMERGENCY: Flag[] = ["INJURY"];
const POLICE: Flag[] = ["HIT_AND_RUN", "PARKED_HIT", "UNINSURED"];
const MANUAL: Flag[] = [
  "REG_VIOLATION",
  "LICENCE_INVALID",
  "OWNER_MISMATCH",
  "SPECIAL_VEHICLE",
  "MULTI_VEHICLE",
  "PARTY_B_TIMEOUT",
  "PARTY_B_UNVERIFIED",
  "SHARED_DISPUTE",
];

export function routeOutcome(flags: string[]): RoutingOutcome {
  const set = new Set(flags);
  if (EMERGENCY.some((f) => set.has(f))) return "EMERGENCY";
  if (POLICE.some((f) => set.has(f))) return "POLICE_REPORT";
  if (MANUAL.some((f) => set.has(f))) return "MANUAL_REVIEW";
  return "AUTOMATIC";
}

// Per-flag metadata for UI (bilingual label + the routing note from §7).
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
  HIT_AND_RUN: {
    severity: "critical",
    en: "Other party left the scene",
    ar: "الطرف الآخر غادر موقع الحادث",
    outcome: "Mandatory police report; hold for investigation.",
  },
  PARKED_HIT: {
    severity: "warn",
    en: "Hit a parked / unattended vehicle",
    ar: "اصطدام بمركبة متوقفة",
    outcome: "Police-report path; record contact left on scene.",
  },
  UNINSURED: {
    severity: "warn",
    en: "No valid / expired / unknown insurance",
    ar: "تأمين غير صالح أو منتهٍ",
    outcome: "Police report; bilateral settlement may not apply.",
  },
  REG_VIOLATION: {
    severity: "warn",
    en: "Registration expired / unregistered",
    ar: "استمارة منتهية / غير مسجلة",
    outcome: "Violation affecting liability → manual review.",
  },
  LICENCE_INVALID: {
    severity: "warn",
    en: "Licence expired / none",
    ar: "رخصة قيادة منتهية / غير موجودة",
    outcome: "May void insurance → manual review.",
  },
  OWNER_MISMATCH: {
    severity: "info",
    en: "Driver is not the owner",
    ar: "السائق ليس مالك المركبة",
    outcome: "Capture owner + authorization; check policy validity.",
  },
  SPECIAL_VEHICLE: {
    severity: "info",
    en: "Rental / commercial / gov / motorcycle",
    ar: "مركبة إيجار / تجارية / حكومية / دراجة",
    outcome: "Require rental contract / company authorization.",
  },
  MULTI_VEHICLE: {
    severity: "warn",
    en: "3+ vehicles involved",
    ar: "ثلاث مركبات أو أكثر",
    outcome: "Beyond two-party flow → escalate to agent to add parties.",
  },
  SINGLE_VEHICLE: {
    severity: "info",
    en: "Single vehicle (object / wall / animal)",
    ar: "مركبة واحدة",
    outcome: "No Party B; skip Party B flow.",
  },
  PARTY_B_TIMEOUT: {
    severity: "warn",
    en: "Party B never connected in time",
    ar: "الطرف الثاني لم يتصل خلال المهلة",
    outcome: "Proceed with Party A data + escalate; claim one-sided.",
  },
  PARTY_B_UNVERIFIED: {
    severity: "warn",
    en: "Party B failed identity verification",
    ar: "فشل التحقق من هوية الطرف الثاني",
    outcome: "Retry then fall back to a human agent.",
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
  SHARED_DISPUTE: {
    severity: "warn",
    en: "Party B disputes the shared account",
    ar: "الطرف الثاني يعترض على الرواية المشتركة",
    outcome: "Block completion → manual review of the discrepancy.",
  },
};

export function mergeFlags(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}
