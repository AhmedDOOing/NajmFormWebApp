import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  audit,
  getLink,
  getLinkForParty,
  getReport,
  setPhase,
  setReportFlags,
  setReportStatus,
} from "@/lib/db";
import { mergeFlags, routeOutcome } from "@/lib/flags";
import { broadcastFlags } from "@/lib/realtime";
import { HOST_BASE_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ slug: z.string() });

// POST /api/report/:id/absent
// "The other driver isn't here." A's part still submits + escalates one-sided,
// and we hand back B's remote link so it can be sent to them instead.
export async function POST(
  req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const report = getReport(params.reportId);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "slug required" }, { status: 422 });

  const aLink = getLink(parsed.data.slug);
  if (!aLink || aLink.reportId !== params.reportId || aLink.party !== "A") {
    return NextResponse.json({ error: "not party A's link" }, { status: 403 });
  }

  const at = new Date().toISOString();
  const flags = mergeFlags(JSON.parse(report.flags) as string[], ["PARTY_B_TIMEOUT"]);
  setReportFlags(params.reportId, flags);
  setReportStatus(params.reportId, "escalated");
  setPhase(params.reportId, "complete");
  audit(params.reportId, "party_b_absent", at, {
    party: "A",
    detail: "one-sided; remote link offered",
  });
  broadcastFlags(params.reportId, flags, "escalated");

  const bLink = getLinkForParty(params.reportId, "B");
  return NextResponse.json({
    ok: true,
    oneSided: true,
    routing: routeOutcome(flags),
    partyBUrl: bLink ? `${HOST_BASE_URL}/r/${bLink.slug}` : null,
  });
}
