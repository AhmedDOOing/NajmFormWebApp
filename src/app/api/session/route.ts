import { NextRequest, NextResponse } from "next/server";
import { sessionSchema } from "@/lib/schema";
import { createSession } from "@/lib/session";
import { baseUrlFromRequest } from "@/lib/config";

export const dynamic = "force-dynamic";

// POST /api/session — the voice agent calls this. eTraffic model: mints one
// report + the causer's filing link (the only filer).
// Body: { reportId?, ttl?, causer?: { vehicle, driver } }
// Returns: { reportId, causer: { url } }
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

  const result = createSession(parsed.data, baseUrlFromRequest(req));

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
