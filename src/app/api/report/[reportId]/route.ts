import { NextRequest, NextResponse } from "next/server";
import { getAudit, getReport } from "@/lib/db";
import { routeOutcome } from "@/lib/flags";
import type { AccidentData, PartyData, PhotoAnalysis } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/report/:reportId — full eTraffic status (for the agent / dashboard).
export async function GET(
  _req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const report = getReport(params.reportId);
  if (!report) {
    return NextResponse.json({ error: "report not found" }, { status: 404 });
  }

  const flags = JSON.parse(report.flags) as string[];
  const partyA = JSON.parse(report.partyA || "{}") as PartyData;
  const partyB = JSON.parse(report.partyB || "{}") as PartyData;
  const accident = JSON.parse(report.accident || "{}") as AccidentData;
  const photoAnalysis = report.photoAnalysis
    ? (JSON.parse(report.photoAnalysis) as PhotoAnalysis)
    : null;

  return NextResponse.json({
    reportId: report.reportId,
    status: report.status,
    flags,
    routing: routeOutcome(flags),
    partyA,
    partyB,
    accident,
    photoAnalysis,
    audit: getAudit(params.reportId),
    createdAt: report.createdAt,
    expiresAt: report.expiresAt,
  });
}
