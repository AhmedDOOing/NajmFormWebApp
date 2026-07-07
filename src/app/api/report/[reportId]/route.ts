import { NextRequest, NextResponse } from "next/server";
import { getAudit, getLocations, getReport, getSubmissions } from "@/lib/db";
import { routeOutcome } from "@/lib/flags";
import { getLangs, getPresence } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// GET /api/report/:reportId — status + flags (for the agent / dashboard).
export async function GET(
  _req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const report = getReport(params.reportId);
  if (!report) {
    return NextResponse.json({ error: "report not found" }, { status: 404 });
  }

  const flags = JSON.parse(report.flags) as string[];
  const submissions = getSubmissions(params.reportId);

  return NextResponse.json({
    reportId: report.reportId,
    status: report.status,
    flags,
    routing: routeOutcome(flags),
    presence: getPresence(params.reportId),
    langs: getLangs(params.reportId),
    locations: getLocations(params.reportId),
    submissions: submissions.map((s) => ({
      party: s.party,
      submittedAt: s.submittedAt,
      flags: s.flags,
    })),
    audit: getAudit(params.reportId),
    createdAt: report.createdAt,
    expiresAt: report.expiresAt,
  });
}
