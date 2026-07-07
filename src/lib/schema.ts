import { z } from "zod";

const vehicleType = z.enum([
  "private",
  "commercial",
  "rental",
  "government",
  "motorcycle",
]);
const insuranceStatus = z.enum(["valid", "expired", "none", "unknown"]);
const otherPartyStatus = z.enum(["present", "fled", "parked", "none"]);

// Predefined values the voice agent captured. Everything optional — Party B's
// prefill is deliberately sparse.
export const prefillSchema = z
  .object({
    city: z.string().optional(),
    district: z.string().optional(),
    landmark: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    accuracy: z.number().optional(),
    locationLabel: z.string().optional(),
    locationSource: z.enum(["gps", "manual"]).optional(),
    fullName: z.string().optional(),
    nationalId: z.string().optional(),
    nationality: z.string().optional(),
    mobile: z.string().optional(),
    licenceNo: z.string().optional(),
    licenceExpiry: z.string().optional(),
    notOwner: z.boolean().optional(),
    ownerName: z.string().optional(),
    ownerAuthorization: z.string().optional(),
    plate: z.string().optional(),
    makeModel: z.string().optional(),
    year: z.string().optional(),
    colour: z.string().optional(),
    vehicleType: vehicleType.optional(),
    registrationStatus: z.enum(["valid", "expired"]).optional(),
    insuranceStatus: insuranceStatus.optional(),
    insurer: z.string().optional(),
    policyNo: z.string().optional(),
    coverageType: z.string().optional(),
    accidentDate: z.string().optional(),
    accidentType: z.string().optional(),
    vehiclesInvolved: z.number().int().optional(),
    description: z.string().optional(),
    damageLocation: z.string().optional(),
    damageSeverity: z.enum(["minor", "moderate", "severe"]).optional(),
    injuries: z.boolean().optional(),
    otherPartyStatus: otherPartyStatus.optional(),
    otherPartyMobile: z.string().optional(),
    _agentFilledFields: z.array(z.string()).optional(),
    _langHint: z.enum(["ar", "en"]).optional(),
  })
  .strict();

// POST /api/session — the voice agent's call.
export const sessionSchema = z.object({
  reportId: z.string().optional(),
  ttl: z.number().int().positive().optional(), // ms
  prefill: z.object({
    A: prefillSchema.default({}),
    B: prefillSchema.default({}),
  }),
});

// POST /api/report/:id/party/:party/submit
export const submitSchema = prefillSchema.extend({
  statement: z.string().optional(),
  consent: z.boolean(),
  locationManual: z.boolean().optional(),
  photosPending: z.boolean().optional(),
  photoCount: z.number().int().optional(),
  identityVerified: z.boolean().optional(),
  sharedDispute: z.boolean().optional(),
});

export type SessionInput = z.infer<typeof sessionSchema>;
export type SubmitInput = z.infer<typeof submitSchema>;
