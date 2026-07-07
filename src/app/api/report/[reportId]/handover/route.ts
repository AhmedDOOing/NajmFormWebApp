import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit, getLink, getReport, getSubmissions, setPhase } from "@/lib/db";
import { getIo } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ slug: z.string() });

// POST /api/report/:id/handover
// Party A hands the phone to the other driver. Locks A's zone one-way.
export async function POST(
  req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const report = getReport(params.reportId);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json({ error: "slug required" }, { status: 422 });

  // Only Party A's own link may trigger the handover.
  const link = getLink(parsed.data.slug);
  if (!link || link.reportId !== params.reportId || link.party !== "A") {
    return NextResponse.json({ error: "not party A's link" }, { status: 403 });
  }

  // A must have completed (submitted) their zone before passing the phone.
  const aDone = getSubmissions(params.reportId).some((s) => s.party === "A");
  if (!aDone) {
    return NextResponse.json(
      { error: "party A must complete their part first" },
      { status: 409 }
    );
  }

  // Idempotent for resume: only advance from partyA.
  if (report.phase === "partyA") {
    const at = new Date().toISOString();
    setPhase(params.reportId, "handover");
    audit(params.reportId, "handover", at, { party: "A", detail: "A zone locked" });
    getIo()?.to(params.reportId).emit("report:flags", {
      flags: JSON.parse(report.flags),
      status: "handover",
    });
  }

  return NextResponse.json({ ok: true, phase: "handover" });
}
