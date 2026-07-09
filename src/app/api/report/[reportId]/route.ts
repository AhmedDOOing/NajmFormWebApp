import { NextRequest, NextResponse } from "next/server";
import { getAffected, getAudit, getReport } from "@/lib/db";
import { routeOutcome } from "@/lib/flags";
import type {
  AccidentData,
  CauserData,
  PhotoAnalysis,
  PropertyItem,
} from "@/lib/types";

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
  const causer = JSON.parse(report.causer || "{}") as CauserData;
  const accident = JSON.parse(report.accident || "{}") as AccidentData;
  const properties = JSON.parse(report.properties || "[]") as PropertyItem[];
  const photoAnalysis = report.photoAnalysis
    ? (JSON.parse(report.photoAnalysis) as PhotoAnalysis)
    : null;
  const affected = getAffected(params.reportId).map((a) => ({
    idx: a.idx,
    vehicle: JSON.parse(a.vehicle),
    driver: JSON.parse(a.driver),
    ack: a.ack,
    ackAt: a.ackAt,
    lookupFailed: !!a.lookupFailed,
  }));

  return NextResponse.json({
    reportId: report.reportId,
    status: report.status,
    flags,
    routing: routeOutcome(flags),
    causer,
    accident,
    properties,
    affected,
    photoAnalysis,
    audit: getAudit(params.reportId),
    createdAt: report.createdAt,
    expiresAt: report.expiresAt,
  });
}
