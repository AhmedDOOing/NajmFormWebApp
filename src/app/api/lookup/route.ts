import { NextRequest, NextResponse } from "next/server";
import { lookupSchema } from "@/lib/schema";
import { lookupParty } from "@/lib/etraffic";

export const dynamic = "force-dynamic";

// POST /api/lookup — registry lookup for an affected driver by vehicle number +
// identity number. Returns read-only vehicle + driver details. Dev stub for now
// (see src/lib/etraffic.ts) — wire the real registry before production.
export async function POST(req: NextRequest) {
  const parsed = lookupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "vehicleNumber + identityNumber required" },
      { status: 422 }
    );
  }
  const res = await lookupParty(
    parsed.data.vehicleNumber,
    parsed.data.identityNumber
  );
  if (!res.found) {
    return NextResponse.json({ found: false }, { status: 404 });
  }
  return NextResponse.json({ found: true, vehicle: res.vehicle, driver: res.driver });
}
