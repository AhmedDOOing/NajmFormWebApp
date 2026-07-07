import { prefillSchema } from "./schema";
import type { Party, Prefill } from "./types";

type VariableBag = Record<string, unknown>;
type PrefillKey = keyof Prefill;

type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "lang"
  | "locationSource"
  | "vehicleType"
  | "registrationStatus"
  | "insuranceStatus"
  | "damageSeverity"
  | "otherPartyStatus";

interface FieldSpec {
  field: PrefillKey;
  kind: FieldKind;
  aliases: string[];
}

export interface HamsaMappingResult {
  session: {
    reportId?: string;
    ttl?: number;
    prefill: { A: Prefill; B: Prefill };
  };
  capturedFields: Record<Party, string[]>;
  ignoredVariables: string[];
  rawVariableNames: string[];
}

export const HAMSA_CAPTURE_VARIABLES = [
  "party_a_full_name",
  "party_a_national_id",
  "party_a_mobile",
  "party_a_nationality",
  "party_a_licence_no",
  "party_a_licence_expiry",
  "party_a_not_owner",
  "party_a_owner_name",
  "party_a_plate",
  "party_a_make_model",
  "party_a_year",
  "party_a_colour",
  "party_a_vehicle_type",
  "party_a_registration_status",
  "party_a_insurance_status",
  "party_a_insurer",
  "party_a_policy_no",
  "party_a_coverage_type",
  "accident_city",
  "accident_district",
  "accident_landmark",
  "accident_lat",
  "accident_lng",
  "accident_location_label",
  "accident_date",
  "accident_type",
  "vehicles_involved",
  "accident_description",
  "damage_location",
  "damage_severity",
  "injuries",
  "other_party_status",
  "other_party_mobile",
  "language",
] as const;

const FIELD_SPECS: FieldSpec[] = [
  field("city", "string", "accident_city", "city", "party_a_city", "a_city"),
  field("district", "string", "accident_district", "district", "party_a_district", "a_district"),
  field("landmark", "string", "accident_landmark", "landmark"),
  field("lat", "number", "accident_lat", "lat", "latitude"),
  field("lng", "number", "accident_lng", "lng", "longitude", "lon"),
  field("accuracy", "number", "accident_accuracy", "location_accuracy"),
  field("locationLabel", "string", "accident_location_label", "location_label", "location"),
  field("locationSource", "locationSource", "location_source"),
  field("fullName", "string", "party_a_full_name", "a_full_name", "caller_name", "driver_name", "full_name", "fullName"),
  field("nationalId", "string", "party_a_national_id", "a_national_id", "caller_national_id", "driver_national_id", "national_id", "id_number", "iqama"),
  field("nationality", "string", "party_a_nationality", "a_nationality", "nationality"),
  field("mobile", "string", "party_a_mobile", "a_mobile", "caller_mobile", "driver_mobile", "mobile", "phone", "phone_number"),
  field("licenceNo", "string", "party_a_licence_no", "party_a_license_no", "licence_no", "license_no", "driver_license"),
  field("licenceExpiry", "string", "party_a_licence_expiry", "party_a_license_expiry", "licence_expiry", "license_expiry"),
  field("notOwner", "boolean", "party_a_not_owner", "not_owner", "driver_not_owner"),
  field("ownerName", "string", "party_a_owner_name", "owner_name"),
  field("ownerAuthorization", "string", "party_a_owner_authorization", "owner_authorization"),
  field("plate", "string", "party_a_plate", "a_plate", "plate", "plate_number", "vehicle_plate"),
  field("makeModel", "string", "party_a_make_model", "a_make_model", "make_model", "vehicle_make_model", "vehicle_model"),
  field("year", "string", "party_a_year", "vehicle_year", "year"),
  field("colour", "string", "party_a_colour", "party_a_color", "vehicle_colour", "vehicle_color", "colour", "color"),
  field("vehicleType", "vehicleType", "party_a_vehicle_type", "vehicle_type"),
  field("registrationStatus", "registrationStatus", "party_a_registration_status", "registration_status"),
  field("insuranceStatus", "insuranceStatus", "party_a_insurance_status", "insurance_status", "insured"),
  field("insurer", "string", "party_a_insurer", "insurer", "insurance_company"),
  field("policyNo", "string", "party_a_policy_no", "policy_no", "insurance_policy_no"),
  field("coverageType", "string", "party_a_coverage_type", "coverage_type"),
  field("accidentDate", "string", "accident_date", "incident_date"),
  field("accidentType", "string", "accident_type", "incident_type", "collision_type"),
  field("vehiclesInvolved", "number", "vehicles_involved", "vehicle_count", "number_of_vehicles"),
  field("description", "string", "accident_description", "description", "incident_description", "summary"),
  field("damageLocation", "string", "damage_location"),
  field("damageSeverity", "damageSeverity", "damage_severity"),
  field("injuries", "boolean", "injuries", "has_injuries", "injury"),
  field("otherPartyStatus", "otherPartyStatus", "other_party_status", "party_b_status", "other_driver_status"),
  field("otherPartyMobile", "string", "other_party_mobile", "party_b_mobile", "b_mobile", "other_driver_mobile"),
  field("_langHint", "lang", "language", "lang", "locale"),
];

export function mapHamsaWebhookToSession(body: unknown): HamsaMappingResult {
  const variableBag = collectVariables(body);
  const normalizedToRaw = new Map<string, string>();
  for (const rawName of Object.keys(variableBag)) {
    normalizedToRaw.set(normalizeName(rawName), rawName);
  }

  const usedRawNames = new Set<string>();
  const prefillA: Prefill = {};
  const capturedFields = new Set<string>();

  for (const spec of FIELD_SPECS) {
    const match = findVariable(variableBag, normalizedToRaw, spec.aliases);
    if (!match) continue;

    const value = coerceValue(match.value, spec.kind);
    if (value === undefined) continue;

    (prefillA as Record<string, unknown>)[spec.field] = value;
    capturedFields.add(String(spec.field));
    usedRawNames.add(match.rawName);
  }

  const filledFields = Object.entries(prefillA)
    .filter(([key, value]) => !key.startsWith("_") && value !== undefined && value !== null && value !== "")
    .map(([key]) => key);

  if (filledFields.length > 0) {
    prefillA._agentFilledFields = filledFields;
  }

  const rawVariableNames = Object.keys(variableBag).sort();
  const reportId = readRootString(body, ["reportId", "report_id", "caseId", "case_id"]);
  const ttl = readRootNumber(body, ["ttl", "ttl_ms", "linkTtl", "link_ttl_ms"]);

  return {
    session: {
      reportId,
      ttl,
      prefill: {
        A: prefillSchema.parse(prefillA),
        B: {},
      },
    },
    capturedFields: { A: [...capturedFields].sort(), B: [] },
    ignoredVariables: rawVariableNames.filter((name) => !usedRawNames.has(name)),
    rawVariableNames,
  };
}

function field(fieldName: PrefillKey, kind: FieldKind, ...aliases: string[]): FieldSpec {
  return { field: fieldName, kind, aliases };
}

function collectVariables(body: unknown): VariableBag {
  const bag: VariableBag = {};
  const root = asRecord(body);
  if (!root) return bag;

  for (const source of [root, asRecord(root.data), asRecord(root.payload), asRecord(root.event)]) {
    if (!source) continue;
    collectVariableContainers(source, bag);

    const outcome = asRecord(source.outcome);
    if (outcome) collectVariableContainers(outcome, bag);

    collectOutcomeVariables(source.outcomes, bag);
  }

  return bag;
}

function collectVariableContainers(source: VariableBag, bag: VariableBag): void {
  for (const key of ["variables", "extractedVariables", "extracted_variables", "slots", "parameters"]) {
    mergeVariableSource(source[key], bag);
  }
}

function collectOutcomeVariables(outcomes: unknown, bag: VariableBag): void {
  if (Array.isArray(outcomes)) {
    for (const item of outcomes) {
      const record = asRecord(item);
      if (!record) continue;
      mergeVariableSource(item, bag);
      collectVariableContainers(record, bag);
    }
    return;
  }

  const record = asRecord(outcomes);
  if (!record) return;

  if (Object.values(record).some((value) => isPrimitive(value) || hasValueWrapper(value))) {
    mergeVariableSource(record, bag);
  }

  for (const value of Object.values(record)) {
    const child = asRecord(value);
    if (!child) continue;
    mergeVariableSource(child, bag);
    collectVariableContainers(child, bag);
  }
}

function mergeVariableSource(source: unknown, bag: VariableBag): void {
  if (!source) return;

  if (Array.isArray(source)) {
    for (const item of source) mergeVariableSource(item, bag);
    return;
  }

  const record = asRecord(source);
  if (!record) return;

  const namedKey = firstString(record, ["name", "key", "field", "variable", "id"]);
  const namedValue = firstPresent(record, ["value", "result", "answer", "extracted_value", "extractedValue"]);
  if (namedKey && namedValue !== undefined) {
    bag[namedKey] = unwrapValue(namedValue);
    return;
  }

  for (const [key, value] of Object.entries(record)) {
    if (["name", "key", "field", "variable", "id"].includes(key)) continue;
    if (value === undefined || value === null) continue;
    bag[key] = unwrapValue(value);
  }
}

function findVariable(
  bag: VariableBag,
  normalizedToRaw: Map<string, string>,
  aliases: string[]
): { rawName: string; value: unknown } | undefined {
  for (const alias of aliases) {
    const rawName = normalizedToRaw.get(normalizeName(alias));
    if (rawName) return { rawName, value: bag[rawName] };
  }
}

function coerceValue(value: unknown, kind: FieldKind): string | number | boolean | undefined {
  if (value === undefined || value === null) return undefined;

  switch (kind) {
    case "string":
      return coerceString(value);
    case "number":
      return coerceNumber(value);
    case "boolean":
      return coerceBoolean(value);
    case "lang":
      return enumFrom(value, {
        ar: ["ar", "arabic", "عربي", "العربية"],
        en: ["en", "english", "انجليزي", "الانجليزية"],
      });
    case "locationSource":
      return enumFrom(value, {
        gps: ["gps", "current_location", "current location", "device"],
        manual: ["manual", "typed", "entered", "fallback"],
      });
    case "vehicleType":
      return enumFrom(value, {
        private: ["private", "personal", "خصوصي"],
        commercial: ["commercial", "business", "تجاري"],
        rental: ["rental", "rent", "lease", "تأجير"],
        government: ["government", "gov", "حكومي"],
        motorcycle: ["motorcycle", "bike", "دراجة", "دراجة نارية"],
      });
    case "registrationStatus":
      return enumFrom(value, {
        valid: ["valid", "active", "yes", "true", "ساري", "صالحة"],
        expired: ["expired", "inactive", "no", "false", "منتهي", "منتهية"],
      });
    case "insuranceStatus":
      return enumFrom(value, {
        valid: ["valid", "insured", "active", "yes", "true", "ساري", "مؤمن"],
        expired: ["expired", "inactive", "منتهي", "منتهية"],
        none: ["none", "uninsured", "not insured", "no", "false", "غير مؤمن"],
        unknown: ["unknown", "not sure", "unsure", "لا اعلم", "غير معروف"],
      });
    case "damageSeverity":
      return enumFrom(value, {
        minor: ["minor", "light", "small", "بسيط"],
        moderate: ["moderate", "medium", "متوسط"],
        severe: ["severe", "major", "heavy", "شديد"],
      });
    case "otherPartyStatus":
      return enumFrom(value, {
        present: ["present", "available", "there", "yes", "true", "موجود"],
        fled: ["fled", "hit_and_run", "hit and run", "left", "ran", "هرب"],
        parked: ["parked", "parked_hit", "parked car", "واقف", "متوقفة"],
        none: ["none", "single_vehicle", "single vehicle", "no", "false", "لا يوجد"],
      });
  }
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : undefined;
  if (typeof value !== "string") return undefined;

  const normalized = normalizeName(value);
  if (["true", "yes", "y", "1", "injured", "hasinjuries", "found", "نعم", "يوجد"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "none", "notinjured", "لا", "لايوجد"].includes(normalized)) return false;
}

function enumFrom<T extends string>(value: unknown, map: Record<T, string[]>): T | undefined {
  const raw = coerceString(value);
  if (!raw) return undefined;

  const normalized = normalizeName(raw);
  for (const [target, aliases] of Object.entries(map) as [T, string[]][]) {
    if (aliases.some((alias) => normalizeName(alias) === normalized)) return target;
  }
}

function readRootString(body: unknown, keys: string[]): string | undefined {
  const root = asRecord(body);
  if (!root) return undefined;
  return coerceString(firstPresent(root, keys));
}

function readRootNumber(body: unknown, keys: string[]): number | undefined {
  const root = asRecord(body);
  if (!root) return undefined;
  return coerceNumber(firstPresent(root, keys));
}

function firstString(record: VariableBag, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
}

function firstPresent(record: VariableBag, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
}

function unwrapValue(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;

  const wrapped = firstPresent(record, ["value", "result", "answer", "extracted_value", "extractedValue"]);
  return wrapped === undefined ? value : wrapped;
}

function hasValueWrapper(value: unknown): boolean {
  const record = asRecord(value);
  return !!record && firstPresent(record, ["value", "result", "answer", "extracted_value", "extractedValue"]) !== undefined;
}

function asRecord(value: unknown): VariableBag | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as VariableBag;
}

function isPrimitive(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
