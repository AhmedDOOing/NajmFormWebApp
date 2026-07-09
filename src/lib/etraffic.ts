// eTraffic-style config + the registry lookup dependency. Everything here is
// config-driven so it can be tuned per deployment.

// Property types the causer can report hitting (config array — editable).
export const PROPERTY_TYPES = [
  "ANIMAL",
  "BUS STOP/SHELTER",
  "CAR UMBRELLA",
  "CONCRETE BARRIERS",
  "DOOR",
  "ELECTRONIC DEVICES",
  "ELECTRONIC GATE",
  "GARAGE DOOR",
  "GASOLINE PUMP HOSE",
  "OTHERS",
  "PRIVATE ADVERTISEMENT",
  "RUBBER BARRIERS/POLE",
  "SIDEWAY",
  "STEEL BARRIERS",
  "STEEL POLES",
  "STREET LIGHT",
  "TELEGRAPH POLE",
  "TRAFFIC AND INDICATIVE SIGNS",
] as const;

export const OWNERSHIP_TYPES = ["Private Property", "Public Property"] as const;

// Causer details form (config-driven selects).
export const VEHICLE_NATIONALITIES = [
  "السعودية · Saudi Arabia",
  "البحرين · Bahrain",
  "الإمارات · UAE",
  "الكويت · Kuwait",
  "أخرى · Other",
] as const;

export const REGISTRATION_TYPES = [
  "PRIVATE",
  "COMMERCIAL",
  "RENTAL",
  "GOVERNMENT",
  "MOTORCYCLE",
  "PUBLIC TRANSPORT",
] as const;

export const IDENTITY_TYPES = [
  "الهوية الوطنية · National ID",
  "إقامة · Iqama",
  "رقم شخصي · Personal Number",
  "جواز سفر · Passport",
] as const;

// Governorate/Region → Area/City (dependent dropdowns). KSA regions here; swap
// per deployment (e.g. Bahrain governorates). Config-driven.
export const REGIONS: Record<string, string[]> = {
  "الرياض · Riyadh": ["الرياض · Riyadh", "الدرعية · Diriyah", "الخرج · Al Kharj", "الدوادمي · Dawadmi"],
  "مكة المكرمة · Makkah": ["جدة · Jeddah", "مكة · Makkah", "الطائف · Taif"],
  "المنطقة الشرقية · Eastern": ["الدمام · Dammam", "الخبر · Khobar", "الأحساء · Al Ahsa", "الجبيل · Jubail"],
  "المدينة المنورة · Madinah": ["المدينة · Madinah", "ينبع · Yanbu"],
  "عسير · Asir": ["أبها · Abha", "خميس مشيط · Khamis Mushait"],
};

// --- registry lookup (THE key external integration) ------------------------
// Adding an affected driver requires looking up their vehicle + driver by
// vehicle number + identity number. In production this must call the real
// registry (KSA: Najm / Elm / Absher; Bahrain: traffic/vehicle registry).
// >>> CLIENT-CONFIRMATION ITEM: wire the real endpoint before go-live. <<<
// The dev stub below returns seeded records so the flow is fully testable now.

export interface VehicleDetails {
  nationality: string;
  number: string;
  registrationType: string;
}
export interface DriverDetails {
  identityType: string;
  identityNumber: string;
  fullName: string;
  mobile: string;
  email: string;
}
export interface LookupResult {
  found: boolean;
  vehicle?: VehicleDetails;
  driver?: DriverDetails;
}

// Seeded records keyed by `${vehicleNumber}|${identityNumber}`.
const STUB: Record<string, { vehicle: VehicleDetails; driver: DriverDetails }> = {
  "4821|2098765432": {
    vehicle: { nationality: "سعودية · Saudi", number: "4821", registrationType: "PRIVATE" },
    driver: {
      identityType: "الهوية الوطنية · National ID",
      identityNumber: "2098765432",
      fullName: "سالم فهد العتيبي · Salem Fahad Al-Otaibi",
      mobile: "0509876543",
      email: "salem@example.com",
    },
  },
  "7391|1122334455": {
    vehicle: { nationality: "سعودية · Saudi", number: "7391", registrationType: "COMMERCIAL" },
    driver: {
      identityType: "إقامة · Iqama",
      identityNumber: "1122334455",
      fullName: "Imran Khan · عمران خان",
      mobile: "0533221100",
      email: "imran@example.com",
    },
  },
};

// The interface production must implement. Async so the real call drops in.
export async function lookupParty(
  vehicleNumber: string,
  identityNumber: string
): Promise<LookupResult> {
  const key = `${vehicleNumber.trim()}|${identityNumber.trim()}`;
  const hit = STUB[key];
  if (!hit) return { found: false };
  return { found: true, vehicle: hit.vehicle, driver: hit.driver };
}
