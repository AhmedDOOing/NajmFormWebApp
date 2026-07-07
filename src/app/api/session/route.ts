import { NextRequest, NextResponse } from "next/server";
import { sessionSchema } from "@/lib/schema";
import { createSession } from "@/lib/session";
import { startPartyBSla } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// POST /api/session — the voice agent calls this at hand-off time.
// Body: { reportId?, ttl?, prefill: { A:{...}, B:{...} } }
// Returns: { reportId, partyA:{url}, partyB:{url} }
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const result = createSession(parsed.data);

  // Kick off the Party-B SLA clock the moment the links are minted.
  startPartyBSla(result.reportId);

  return NextResponse.json(
    {
      reportId: result.reportId,
      expiresAt: result.expiresAt,
      partyA: { url: result.partyA.url },
      partyB: { url: result.partyB.url },
    },
    { status: 201 }
  );
}
