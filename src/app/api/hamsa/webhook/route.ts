import { NextRequest, NextResponse } from "next/server";
import { HAMSA_WEBHOOK_SECRET } from "@/lib/config";
import {
  HAMSA_CAPTURE_VARIABLES,
  mapHamsaWebhookToSession,
} from "@/lib/hamsa";
import { createSession } from "@/lib/session";
import { startPartyBSla } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// POST /api/hamsa/webhook — adapter for Hamsa outcome/extracted variables.
// Hamsa only captures Party A / caller-side facts; Party B prefill remains
// empty so B enters and consents to their own details during handover.
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let mapped: ReturnType<typeof mapHamsaWebhookToSession>;
  try {
    mapped = mapHamsaWebhookToSession(body);
  } catch (error) {
    return NextResponse.json(
      { error: "validation failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 422 }
    );
  }

  const result = createSession(mapped.session);
  startPartyBSla(result.reportId);

  return NextResponse.json(
    {
      reportId: result.reportId,
      expiresAt: result.expiresAt,
      partyA: { url: result.partyA.url },
      partyB: { url: result.partyB.url },
      capturedFields: mapped.capturedFields,
      ignoredVariables: mapped.ignoredVariables,
      rawVariableNames: mapped.rawVariableNames,
      recommendedVariables: HAMSA_CAPTURE_VARIABLES,
    },
    { status: 201 }
  );
}

function authorized(req: NextRequest): boolean {
  if (!HAMSA_WEBHOOK_SECRET) return true;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const sharedSecret = req.headers.get("x-hamsa-secret");
  return bearer === HAMSA_WEBHOOK_SECRET || sharedSecret === HAMSA_WEBHOOK_SECRET;
}
