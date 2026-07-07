export type Party = "A" | "B";

export type Locale = "ar" | "en";

export type ReportStatus =
  | "open"
  | "partyA_done"
  | "partyB_done"
  | "complete"
  | "escalated"
  | "expired";

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
  | "PHOTO_PENDING";

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

// What a party actually submits (superset of Prefill + consent + statement).
export interface SubmitPayload extends Prefill {
  statement?: string; // driver's own words — never agent-filled
  consent: boolean; // must be affirmed by the driver
  locationManual?: boolean; // GPS failed, entered by hand -> LOC_MANUAL
  photosPending?: boolean; // couldn't upload now -> PHOTO_PENDING
  photoCount?: number;
  identityVerified?: boolean;
}
