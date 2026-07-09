import { NextRequest, NextResponse } from "next/server";
import { ackSchema } from "@/lib/schema";
import {
  audit,
  getAffected,
  getAffectedByAckSlug,
  setAck,
  setReportFlags,
  setReportStatus,
  getReport,
} from "@/lib/db";
import { mergeFlags, routeOutcome } from "@/lib/flags";
import { broadcastFlags } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// POST /api/ack/:ackSlug — the affected party accepts or rejects the causer's
// fault admission. NO data entry. Accept (all) -> complete; reject -> disputed.
export async function POST(
  req: NextRequest,
  { params }: { params: { ackSlug: string } }
) {
  const row = getAffectedByAckSlug(params.ackSlug);
  if (!row) return NextResponse.json({ error: "unknown link" }, { status: 404 });

  const parsed = ackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "decision required" }, { status: 422 });

  const report = getReport(row.reportId);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });

  const at = new Date().toISOString();
  const decision = parsed.data.decision === "accept" ? "accepted" : "rejected";
  setAck(params.ackSlug, decision, at);
  audit(row.reportId, `affected_${decision}`, at, {
    detail: `affected #${row.idx + 1}`,
  });

  // Recompute report state across all affected parties.
  const all = getAffected(row.reportId);
  const anyRejected = all.some((a) => a.ack === "rejected");
  const allAccepted = all.every((a) => a.ack === "accepted");

  let flags = JSON.parse(report.flags) as string[];
  if (anyRejected) flags = mergeFlags(flags, ["FAULT_DISPUTED"]);
  setReportFlags(row.reportId, flags);

  const routing = routeOutcome(flags);
  let status: string;
  if (routing === "EMERGENCY") status = "escalated";
  else if (anyRejected) status = "disputed";
  else if (allAccepted) status = "complete";
  else status = "filed";
  setReportStatus(row.reportId, status as never);
  broadcastFlags(row.reportId, flags, status);

  return NextResponse.json({ ok: true, decision, status, routing });
}
