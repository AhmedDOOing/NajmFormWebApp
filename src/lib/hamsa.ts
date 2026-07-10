import { z } from "zod";
import type { DriverInfo, IntakeData, VehicleInfo } from "./types";

// ---------------------------------------------------------------------------
// Hamsa webhook envelope + outcome mapping.
//
// Hamsa POSTs call-lifecycle events (docs.tryhamsa.com → Webhooks):
//   { eventType, callId, timestamp, projectId?, agentId?, agentName?,
//     data: { data: { conversationId, conversationRecording,
//                     transcription: [{Agent|User: string}],
//                     outcomeResult: { ...agent-extracted fields... } } } }
//
// Only `call.ended` carries `outcomeResult` — the structured fields the voice
// agent extracted from the call. We control what the agent extracts, but key
// names drift between agent configs, so mapping is tolerant: keys are
// normalized (lowercased, separators stripped) and matched against the synonym
// table below. Unknown keys are ignored, never fatal.
// ---------------------------------------------------------------------------

export const HAMSA_EVENT_TYPES = [
  "call.started",
  "call.answered",
  "transcription.update",
  "tool.executed",
  "call.ended",
] as const;
export type HamsaEventType = (typeof HAMSA_EVENT_TYPES)[number];

// Lenient on purpose: Hamsa's envelope may grow fields; we never reject a
// webhook on shape drift — worst case it lands in the feed as "unrecognized".
export const hamsaEnvelopeSchema = z
  .object({
    eventType: z.string(),
    callId: z.string().optional(),
    timestamp: z.string().optional(),
    projectId: z.string().optional(),
    agentId: z.string().optional(),
    agentName: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();
export type HamsaEnvelope = z.infer<typeof hamsaEnvelopeSchema>;

// The synonym table — the contract with the Hamsa agent config. The agent's
// outcome fields must use ANY of these names (case/underscore/dash-insensitive).
// Documented in docs/hamsa.md; keep the two in sync.
export const OUTCOME_SYNONYMS = {
  // Party A (the caller) — vehicle
  "partyA.vehicle.nationality": ["vehiclenationality", "carnationality", "vehiclecountry"],
  "partyA.vehicle.number": ["vehiclenumber", "plate", "platenumber", "plateno", "vehicleplate", "carplate"],
  "partyA.vehicle.registrationType": ["registrationtype", "vehicleregistrationtype", "vehicletype"],
  // Party A — driver
  "partyA.driver.identityType": ["identitytype", "idtype"],
  "partyA.driver.identityNumber": ["identitynumber", "nationalid", "idnumber", "iqama", "iqamanumber", "personalnumber"],
  "partyA.driver.fullName": ["fullname", "drivername", "name", "callername", "causername"],
  "partyA.driver.mobile": ["mobile", "drivermobile", "phone", "phonenumber", "callerphone", "mobilenumber", "causermobile"],
  "partyA.driver.email": ["email", "driveremail", "causeremail"],
  // Party A — self-declared role (skips the triage chooser when captured)
  "partyA.declaredRole": ["declaredrole", "role", "atfault", "faultrole", "whichdriver"],
  // Party B (the other driver) — usually just a phone; more if captured
  "partyB.driver.mobile": ["otherpartymobile", "affectedmobile", "otherphone", "otherpartyphone", "otherdrivermobile", "affectedphone", "partybmobile"],
  "partyB.driver.fullName": ["otherpartyname", "otherdrivername", "affectedname", "partybname"],
  "partyB.driver.identityNumber": ["otherpartyid", "otherdriverid", "affectedid", "partybid"],
  "partyB.vehicle.number": ["otherplate", "otherpartyplate", "othervehiclenumber", "partybplate"],
  // intake extras
  "intake.injuries": ["injuries", "anyinjuries", "hasinjuries", "injured"],
  "intake.accidentHints.governorate": ["governorate", "region", "accidentregion"],
  "intake.accidentHints.area": ["area", "city", "accidentcity", "accidentarea"],
  "intake.accidentHints.locationText": ["location", "locationtext", "accidentlocation", "street", "landmark"],
  "intake.accidentHints.dateTime": ["datetime", "accidentdatetime", "accidentdate", "accidenttime", "incidentdate"],
  "intake.accidentHints.accidentType": ["accidenttype", "incidenttype", "collisiontype"],
} as const;

export interface MappedOutcome {
  partyA: {
    vehicle: Partial<VehicleInfo>;
    driver: Partial<DriverInfo>;
    declaredRole?: "affected" | "causer";
  };
  partyB: { vehicle: Partial<VehicleInfo>; driver: Partial<DriverInfo> } | undefined;
  intake: IntakeData;
  /** outcome keys we didn't recognize — surfaced in the feed for debugging */
  ignoredKeys: string[];
}

const normalizeKey = (k: string) => k.toLowerCase().replace(/[\s_-]+/g, "");

function coerceBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["yes", "true", "y", "1", "نعم", "اي", "أجل"].includes(s)) return true;
    if (["no", "false", "n", "0", "لا", "كلا"].includes(s)) return false;
  }
  return undefined;
}

function coerceRole(v: unknown): "affected" | "causer" | undefined {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (["causer", "atfault", "at fault", "at-fault", "متسبب", "المتسبب"].includes(s)) return "causer";
  if (["affected", "victim", "متضرر", "المتضرر"].includes(s)) return "affected";
  if (typeof v === "boolean") return v ? "causer" : "affected"; // at_fault: true
  return undefined;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined;

// Map a raw outcomeResult bag onto Party A/B prefill + intake, tolerantly.
export function mapOutcome(
  outcome: Record<string, unknown>,
  callId?: string
): MappedOutcome {
  // normalized key -> canonical target path
  const lookup = new Map<string, string>();
  for (const [target, aliases] of Object.entries(OUTCOME_SYNONYMS)) {
    for (const a of aliases) lookup.set(a, target);
  }

  const aVehicle: Partial<VehicleInfo> = {};
  const aDriver: Partial<DriverInfo> = {};
  const bVehicle: Partial<VehicleInfo> = {};
  const bDriver: Partial<DriverInfo> = {};
  let declaredRole: "affected" | "causer" | undefined;
  const hints: NonNullable<IntakeData["accidentHints"]> = {};
  const intake: IntakeData = { source: "hamsa", callId };
  const ignoredKeys: string[] = [];

  for (const [rawKey, rawVal] of Object.entries(outcome)) {
    const target = lookup.get(normalizeKey(rawKey));
    if (!target) {
      ignoredKeys.push(rawKey);
      continue;
    }
    switch (target) {
      case "partyA.vehicle.nationality": aVehicle.nationality = str(rawVal) ?? aVehicle.nationality; break;
      case "partyA.vehicle.number": aVehicle.number = str(rawVal) ?? aVehicle.number; break;
      case "partyA.vehicle.registrationType": aVehicle.registrationType = str(rawVal)?.toUpperCase() ?? aVehicle.registrationType; break;
      case "partyA.driver.identityType": aDriver.identityType = str(rawVal) ?? aDriver.identityType; break;
      case "partyA.driver.identityNumber": aDriver.identityNumber = str(rawVal) ?? aDriver.identityNumber; break;
      case "partyA.driver.fullName": aDriver.fullName = str(rawVal) ?? aDriver.fullName; break;
      case "partyA.driver.mobile": aDriver.mobile = str(rawVal) ?? aDriver.mobile; break;
      case "partyA.driver.email": aDriver.email = str(rawVal) ?? aDriver.email; break;
      case "partyA.declaredRole": declaredRole = coerceRole(rawVal) ?? declaredRole; break;
      case "partyB.driver.mobile": bDriver.mobile = str(rawVal) ?? bDriver.mobile; break;
      case "partyB.driver.fullName": bDriver.fullName = str(rawVal) ?? bDriver.fullName; break;
      case "partyB.driver.identityNumber": bDriver.identityNumber = str(rawVal) ?? bDriver.identityNumber; break;
      case "partyB.vehicle.number": bVehicle.number = str(rawVal) ?? bVehicle.number; break;
      case "intake.injuries": intake.injuries = coerceBool(rawVal) ?? intake.injuries; break;
      case "intake.accidentHints.governorate": hints.governorate = str(rawVal) ?? hints.governorate; break;
      case "intake.accidentHints.area": hints.area = str(rawVal) ?? hints.area; break;
      case "intake.accidentHints.locationText": hints.locationText = str(rawVal) ?? hints.locationText; break;
      case "intake.accidentHints.dateTime": hints.dateTime = str(rawVal) ?? hints.dateTime; break;
      case "intake.accidentHints.accidentType": hints.accidentType = str(rawVal) ?? hints.accidentType; break;
    }
  }

  if (Object.keys(hints).length > 0) intake.accidentHints = hints;
  const hasB = Object.keys(bDriver).length > 0 || Object.keys(bVehicle).length > 0;
  return {
    partyA: { vehicle: aVehicle, driver: aDriver, declaredRole },
    partyB: hasB ? { vehicle: bVehicle, driver: bDriver } : undefined,
    intake,
    ignoredKeys,
  };
}

// Hamsa nests the useful bits under data.data (observed in their docs). Be
// tolerant: accept data.data, data, or top-level placement.
export function extractCallData(envelope: HamsaEnvelope): {
  conversationId?: string;
  transcription?: Array<Record<string, string>>;
  outcomeResult?: Record<string, unknown>;
} {
  const candidates: unknown[] = [];
  const d = envelope.data as Record<string, unknown> | undefined;
  if (d && typeof d === "object") {
    if (d.data && typeof d.data === "object") candidates.push(d.data);
    candidates.push(d);
  }
  candidates.push(envelope);

  for (const c of candidates) {
    const o = c as Record<string, unknown>;
    if (o.outcomeResult || o.transcription || o.conversationId) {
      return {
        conversationId: str(o.conversationId),
        transcription: Array.isArray(o.transcription)
          ? (o.transcription as Array<Record<string, string>>)
          : undefined,
        outcomeResult:
          o.outcomeResult && typeof o.outcomeResult === "object"
            ? (o.outcomeResult as Record<string, unknown>)
            : undefined,
      };
    }
  }
  return {};
}

// One human-readable line per event for the live feed panel.
export function summarizeEvent(envelope: HamsaEnvelope): string {
  const call = envelope.callId ? ` · ${envelope.callId}` : "";
  switch (envelope.eventType) {
    case "call.started":
      return `Call started${call}`;
    case "call.answered":
      return `Call answered${call}`;
    case "transcription.update": {
      const { transcription } = extractCallData(envelope);
      const last = transcription?.[transcription.length - 1];
      const [speaker, text] = last ? Object.entries(last)[0] ?? [] : [];
      return text ? `${speaker}: "${String(text).slice(0, 80)}"` : `Transcription update${call}`;
    }
    case "tool.executed":
      return `Agent tool executed${call}`;
    case "call.ended":
      return `Call ended${call} — outcome received`;
    default:
      return `Unrecognized event "${envelope.eventType}"${call}`;
  }
}
