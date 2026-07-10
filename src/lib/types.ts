export type Party = "A" | "B";

export type Locale = "ar" | "en";

export type ReportStatus =
  | "open"
  | "filed" // causer submitted; awaiting affected acknowledgment
  | "complete"
  | "escalated"
  | "disputed"
  | "expired";

// Edge-case flags (eTraffic model). Each maps to a routing outcome.
export type Flag =
  | "INJURY"
  | "LINK_EXPIRED"
  | "LOC_MANUAL"
  | "PHOTO_PENDING"
  | "FAULT_DISPUTED"
  | "AFFECTED_TIMEOUT"
  | "AFFECTED_LOOKUP_FAILED"
  | "PROPERTY_ONLY"
  // AI photo-analysis flags — ASSISTIVE only. Both route to manual review; the
  // AI never confirms or overrides the causer's fault admission.
  | "AI_FAULT_MISMATCH"
  | "AI_DAMAGE_INCONSISTENT";

export type RoutingOutcome =
  | "EMERGENCY"
  | "POLICE_REPORT"
  | "MANUAL_REVIEW"
  | "AUTOMATIC";

export interface ReportRow {
  reportId: string;
  status: ReportStatus;
  createdAt: string;
  expiresAt: string;
  flags: string; // JSON string[] in the DB
  causer: string; // JSON CauserData
  accident: string; // JSON AccidentData
  properties: string; // JSON PropertyItem[]
  photoAnalysis: string; // JSON PhotoAnalysis | '' (empty = not run)
  intake: string; // JSON IntakeData — how the report was minted (hamsa|manual)
}

export interface LinkRow {
  slug: string;
  reportId: string;
  party: Party;
  prefill: string; // JSON in the DB
  usedAt: string | null;
  expiresAt: string;
}

// ===========================================================================
// eTraffic model: one at-fault filer (causer) + affected-party acknowledgment.
// ===========================================================================

export interface VehicleInfo {
  nationality?: string;
  number: string;
  registrationType?: string;
}
export interface DriverInfo {
  identityType?: string;
  identityNumber: string;
  fullName?: string;
  mobile?: string;
  email?: string;
}

export interface CauserData {
  vehicle: VehicleInfo;
  driver: DriverInfo;
  faultDeclaration?: { accepted: true; at: string };
}

// How the report was minted + what the voice call captured beyond the causer's
// identity. Webhook-minted reports carry source:"hamsa" and skip the manual
// role-chooser; seed/demo reports carry source:"manual" and keep it.
export interface IntakeData {
  source: "hamsa" | "manual";
  callId?: string;
  injuries?: boolean;
  otherPartyMobile?: string;
  accidentHints?: {
    governorate?: string;
    area?: string;
    locationText?: string;
    dateTime?: string;
    accidentType?: string;
  };
}

export type AckStatus = "pending" | "accepted" | "rejected";

// Stored in the `affected` table (read-only, from the registry lookup).
export interface AffectedRow {
  reportId: string;
  idx: number;
  vehicle: string; // JSON VehicleInfo
  driver: string; // JSON DriverInfo
  ackSlug: string;
  ack: AckStatus;
  ackAt: string | null;
  lookupFailed: number; // 0/1 — added via declared fallback
  addedAt: string;
}
export interface Affected {
  idx: number;
  vehicle: VehicleInfo;
  driver: DriverInfo;
  ackSlug: string;
  ack: AckStatus;
  ackAt: string | null;
  lookupFailed: boolean;
}

export interface PropertyItem {
  type: string;
  ownership: string;
  address: string;
}

export interface AccidentData {
  governorate?: string;
  area?: string;
  locationText?: string;
  dateTime?: string;
  coordinates?: { lat: number; lng: number; accuracy?: number };
  locationSource?: "gps" | "manual";
  photoCount?: number;
  photosPending?: boolean;
  injuries?: boolean;
}

// ===========================================================================
// AI photo analysis — ASSISTIVE, human-reviewed. Never authoritative.
// The output is a *preliminary* read of the uploaded scene photos: it describes
// visible damage and flags inconsistencies for a human reviewer. It NEVER
// decides or confirms fault, and no code path auto-approves/closes a claim from
// it. `faultIndication.party` maps A = the driver who signed the fault
// declaration (causer), B = the other/affected party.
// ===========================================================================

export type FaultParty = "A" | "B" | "shared" | "undetermined";

export interface PerImageNote {
  index: number;
  description: string;
  damageAreas: string[];
  qualityIssue: string; // "" when the image is usable
}

export interface PhotoAnalysisResult {
  perImage: PerImageNote[];
  damageSummary: string;
  consistency: {
    matchesDescription: boolean;
    discrepancies: string[];
  };
  faultIndication: {
    party: FaultParty; // A = causer (admitted), B = affected — see note above
    confidence: number; // 0..1
    reasoning: string;
    limitations: string;
  };
  imageQualityIssues: string[];
}

export type AnalysisStatus = "complete" | "failed" | "skipped";

// Self-contained, storable record. Everything needed to persist this to its own
// table later (Postgres/Supabase) lives here — id, model, timestamp, status, and
// the validated result — so it never depends on the surrounding report row.
export interface PhotoAnalysis {
  reportId?: string; // stamped by the route before storing
  status: AnalysisStatus;
  modelVersion: string; // "claude-sonnet-5" | "stub" | "none"
  at: string; // ISO timestamp
  imageCount: number;
  result?: PhotoAnalysisResult; // present when status === "complete"
  error?: string; // present when status === "failed"
}
