import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  audit,
  getLink,
  getReport,
  getSubmissions,
  setPhase,
  setReportFlags,
  setReportStatus,
} from "@/lib/db";
import { mergeFlags, routeOutcome } from "@/lib/flags";
import { broadcastFlags } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ slug: z.string(), reason: z.string().min(1) });

// POST /api/report/:id/absent
// The gated exit when the other driver isn't present. Only reachable after the
// present party has submitted; requires a declared reason. Files a one-sided
// report (PARTY_ABSENT) and escalates for manual review.
export async function POST(
  req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const report = getReport(params.reportId);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "slug + reason required" }, { status: 422 });

  const link = getLink(parsed.data.slug);
  if (!link || link.reportId !== params.reportId) {
    return NextResponse.json({ error: "invalid token for report" }, { status: 403 });
  }

  // At least one party must be complete before a one-sided report can be filed.
  const done = getSubmissions(params.reportId);
  if (done.length === 0) {
    return NextResponse.json(
      { error: "complete your own part before declaring the other driver absent" },
      { status: 409 }
    );
  }

  const at = new Date().toISOString();
  const flags = mergeFlags(JSON.parse(report.flags) as string[], ["PARTY_ABSENT"]);
  setReportFlags(params.reportId, flags);
  setReportStatus(params.reportId, "escalated");
  setPhase(params.reportId, "complete");
  audit(params.reportId, "party_absent_declared", at, {
    party: done[0].party,
    detail: parsed.data.reason,
  });
  broadcastFlags(params.reportId, flags, "escalated");

  return NextResponse.json({ ok: true, oneSided: true, routing: routeOutcome(flags) });
}
