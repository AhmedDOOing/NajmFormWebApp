export type Party = "A" | "B";

export type Locale = "ar" | "en";

export type ReportStatus =
  | "open"
  | "partyA_done"
  | "partyB_done"
  | "filed" // causer submitted; awaiting affected acknowledgment
  | "complete"
  | "escalated"
  | "disputed"
  | "expired";

// Single-device handover phase — drives zone edit-locks (server-enforced).
export type Phase = "partyA" | "handover" | "partyB" | "complete";

export type Presence = "connected" | "filling" | "submitted" | "absent";

// Edge-case flags — see build brief §7. Each maps to a routing outcome.
export type Flag =
  | "INJURY"
  | "HIT_AND_RUN"
  | "PARKED_HIT"
  | "UNINSURED"
  | "REG_VIOLATION"
  | "LICENCE_INVALID"
  | "OWNER_MISMATCH"
  | "SPECIAL_VEHICLE"
  | "MULTI_VEHICLE"
  | "SINGLE_VEHICLE"
  | "PARTY_B_TIMEOUT"
  | "PARTY_B_UNVERIFIED"
  | "LINK_EXPIRED"
  | "LOC_MANUAL"
  | "PHOTO_PENDING"
  | "SHARED_DISPUTE"
  | "PARTY_ABSENT"
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
  phase: Phase;
  verifyAttempts: number;
  causer: string; // JSON CauserData
  accident: string; // JSON AccidentData
  properties: string; // JSON PropertyItem[]
  photoAnalysis: string; // JSON PhotoAnalysis | '' (empty = not run)
}

export interface LinkRow {
  slug: string;
  reportId: string;
  party: Party;
  prefill: string; // JSON in the DB
  usedAt: string | null;
  expiresAt: string;
}

// The predefined field values the voice agent captured, keyed by section.
// Everything here is optional — Party B's prefill is intentionally minimal.
export interface Prefill {
  // location
  city?: string;
  district?: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  accuracy?: number; // metres, from the Geolocation API
  locationLabel?: string; // resolved place name / chosen nearby place
  locationSource?: "gps" | "manual";
  // your details
  fullName?: string;
  nationalId?: string;
  nationality?: string;
  mobile?: string;
  licenceNo?: string;
  licenceExpiry?: string; // ISO date
  notOwner?: boolean;
  ownerName?: string;
  ownerAuthorization?: string;
  // vehicle
  plate?: string;
  makeModel?: string;
  year?: string;
  colour?: string;
  vehicleType?: VehicleType;
  registrationStatus?: "valid" | "expired";
  // insurance
  insuranceStatus?: InsuranceStatus;
  insurer?: string;
  policyNo?: string;
  coverageType?: string;
  // accident
  accidentDate?: string;
  accidentType?: string;
  vehiclesInvolved?: number;
  description?: string;
  damageLocation?: string;
  damageSeverity?: "minor" | "moderate" | "severe";
  injuries?: boolean;
  // other party
  otherPartyStatus?: OtherPartyStatus;
  otherPartyMobile?: string;
  // fields the agent may pre-fill; consent + own statement are NEVER pre-filled
  _agentFilledFields?: string[];
  // optional language hint from the voice call — pre-highlights the gate option
  _langHint?: Locale;
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

// A location shared by a party before/at submit (lives on the report, live over
// the socket, shown on the dashboard).
export interface PartyLocation {
  party: Party;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  label: string | null;
  source: "gps" | "manual";
  at: string;
}

export type VehicleType =
  | "private"
  | "commercial"
  | "rental"
  | "government"
  | "motorcycle";

export type InsuranceStatus = "valid" | "expired" | "none" | "unknown";

export type OtherPartyStatus = "present" | "fled" | "parked" | "none";

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

// What a party actually submits (superset of Prefill + consent + statement).
export interface SubmitPayload extends Prefill {
  statement?: string; // driver's own words — never agent-filled
  consent: boolean; // must be affirmed by the driver
  locationManual?: boolean; // GPS failed, entered by hand -> LOC_MANUAL
  photosPending?: boolean; // couldn't upload now -> PHOTO_PENDING
  photoCount?: number;
  identityVerified?: boolean;
  sharedDispute?: boolean; // Party B disputes A's account -> SHARED_DISPUTE
}
