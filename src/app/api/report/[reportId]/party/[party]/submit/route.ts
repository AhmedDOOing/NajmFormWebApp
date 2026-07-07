import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { submitSchema } from "@/lib/schema";
import {
  audit,
  getLink,
  getReport,
  getSubmissions,
  markLinkUsed,
  recordConsent,
  setReportFlags,
  setReportStatus,
  upsertSubmission,
} from "@/lib/db";
import { computeFlags, mergeFlags, routeOutcome } from "@/lib/flags";
import { broadcastFlags, cancelPartyBSla, markSubmitted } from "@/lib/realtime";
import type { Party, ReportStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slug: z.string(),
  answers: submitSchema,
});

// POST /api/report/:reportId/party/:party/submit
export async function POST(
  req: NextRequest,
  { params }: { params: { reportId: string; party: string } }
) {
  const party = params.party.toUpperCase() as Party;
  if (party !== "A" && party !== "B") {
    return NextResponse.json({ error: "invalid party" }, { status: 400 });
  }

  const report = getReport(params.reportId);
  if (!report) {
    return NextResponse.json({ error: "report not found" }, { status: 404 });
  }
  if (report.status === "expired") {
    return NextResponse.json({ error: "report expired" }, { status: 410 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { slug, answers } = parsed.data;

  // Security: the slug/token must belong to THIS report + party (brief §9).
  const link = getLink(slug);
  if (!link || link.reportId !== params.reportId || link.party !== party) {
    return NextResponse.json(
      { error: "token does not match report/party" },
      { status: 403 }
    );
  }

  // Consent is never agent-filled and gates all processing.
  if (!answers.consent) {
    return NextResponse.json({ error: "consent required" }, { status: 422 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Compute this party's edge-case flags.
  const partyFlags = computeFlags(answers, now);

  // Persist submission + consent + audit trail.
  upsertSubmission({
    reportId: params.reportId,
    party,
    answers,
    flags: partyFlags,
    submittedAt: nowIso,
  });
  recordConsent(params.reportId, party, nowIso);
  markLinkUsed(slug, nowIso);
  audit(params.reportId, "party_submitted", nowIso, {
    party,
    detail: partyFlags.join(","),
  });

  // Merge flags across both parties + any flags already on the report (e.g. a
  // server-set PARTY_B_TIMEOUT).
  const existing = JSON.parse(report.flags) as string[];
  const allSubs = getSubmissions(params.reportId);
  const merged = mergeFlags(
    existing,
    ...allSubs.map((s) => s.flags),
    partyFlags
  );
  setReportFlags(params.reportId, merged);

  // Advance report status.
  const submittedParties = new Set(allSubs.map((s) => s.party));
  submittedParties.add(party);
  let status: ReportStatus;
  const bothDone = submittedParties.has("A") && submittedParties.has("B");
  const singleVehicle = merged.includes("SINGLE_VEHICLE");
  const bTimedOut = merged.includes("PARTY_B_TIMEOUT");

  if (bothDone || (party === "A" && (singleVehicle || bTimedOut))) {
    // Complete when both submit, OR when there is no Party B (single vehicle),
    // OR Party A finishes after Party B timed out.
    status = "complete";
  } else if (party === "A") {
    status = "partyA_done";
  } else {
    status = "partyB_done";
  }

  // Emergency/police/manual outcomes mark the report escalated for routing.
  const routing = routeOutcome(merged);
  if (routing === "EMERGENCY" || routing === "POLICE_REPORT") {
    status = "escalated";
  }
  setReportStatus(params.reportId, status);

  if (party === "B") cancelPartyBSla(params.reportId);

  // Realtime: presence -> submitted, party:submitted, sync:complete if both.
  markSubmitted(params.reportId, party);
  broadcastFlags(params.reportId, merged, status);

  return NextResponse.json({
    ok: true,
    reportId: params.reportId,
    party,
    status,
    flags: merged,
    partyFlags,
    routing,
  });
}
