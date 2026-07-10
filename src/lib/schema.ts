import { z } from "zod";

// POST /api/session — the voice agent's call. eTraffic: only the causer.
const vehicleInfo = z
  .object({
    nationality: z.string().optional(),
    number: z.string().optional(),
    registrationType: z.string().optional(),
  })
  .partial();
const driverInfo = z
  .object({
    identityType: z.string().optional(),
    identityNumber: z.string().optional(),
    fullName: z.string().optional(),
    mobile: z.string().optional(),
    email: z.string().optional(),
  })
  .partial();

export const sessionSchema = z.object({
  reportId: z.string().optional(),
  ttl: z.number().int().positive().optional(), // ms
  causer: z
    .object({ vehicle: vehicleInfo.optional(), driver: driverInfo.optional() })
    .optional(),
});

// POST /api/lookup — registry lookup for an affected party.
export const lookupSchema = z.object({
  vehicleNumber: z.string().min(1),
  identityNumber: z.string().min(1),
});

// POST /api/report/:id/submit — the causer files the whole report.
export const causerSubmitSchema = z.object({
  causer: z
    .object({ vehicle: vehicleInfo.required().partial(), driver: driverInfo })
    .partial()
    .optional(),
  affected: z
    .array(
      z.object({
        vehicle: z.object({
          nationality: z.string().optional(),
          number: z.string(),
          registrationType: z.string().optional(),
        }),
        driver: z.object({
          identityType: z.string().optional(),
          identityNumber: z.string(),
          fullName: z.string().optional(),
          mobile: z.string().optional(),
          email: z.string().optional(),
        }),
        lookupFailed: z.boolean().optional(),
      })
    )
    .default([]),
  properties: z
    .array(
      z.object({
        type: z.string(),
        ownership: z.string(),
        address: z.string().max(80),
      })
    )
    .default([]),
  accident: z.object({
    governorate: z.string().optional(),
    area: z.string().optional(),
    locationText: z.string().max(80).optional(),
    dateTime: z.string().optional(),
    coordinates: z
      .object({ lat: z.number(), lng: z.number(), accuracy: z.number().optional() })
      .optional(),
    locationSource: z.enum(["gps", "manual"]).optional(),
    photoCount: z.number().int().optional(),
    photosPending: z.boolean().optional(),
    injuries: z.boolean().optional(),
  }),
  faultDeclaration: z.literal(true),
});

// POST /api/ack/:ackSlug — affected party accepts/rejects the fault admission.
export const ackSchema = z.object({ decision: z.enum(["accept", "reject"]) });

export type SessionInput = z.infer<typeof sessionSchema>;
