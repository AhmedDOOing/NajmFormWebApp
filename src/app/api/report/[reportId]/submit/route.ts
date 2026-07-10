import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { partySubmitSchema } from "@/lib/schema";
import {
  audit,
  getLink,
  getLinkForParty,
  getReport,
  hasSmsFor,
  insertFeedEvent,
  setAccident,
  setParty,
  setReportFlags,
  setReportStatus,
} from "@/lib/db";
import { mergeFlags, routeOutcome } from "@/lib/flags";
import { deriveAiFlags } from "@/lib/photoAnalysis";
import { sendSms, SMS_TEMPLATES } from "@/lib/sms";
import { baseUrlFromRequest } from "@/lib/config";
import type { AccidentData, Flag, IntakeData, PartyData, PhotoAnalysis } from "@/lib/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ slug: z.string() }).and(partySubmitSchema);

// POST /api/report/:id/submit — a party (A or B, decided by the link) files
// their OWN section. Neutral: no fault, no "adding" the other party. Party A
// also carries the shared accident details. Any combination completes safely.
export async function POST(
  req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const report = getReport(params.reportId);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });
  if (report.status === "expired")
    return NextResponse.json({ error: "report expired" }, { status: 410 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const body = parsed.data;

  // The link decides which party is filing.
  const link = getLink(body.slug);
  if (!link || link.reportId !== params.reportId || (link.party !== "A" && link.party !== "B")) {
    return NextResponse.json({ error: "invalid link" }, { status: 403 });
  }
  const party = link.party;
  const at = new Date().toISOString();

  const partyA = JSON.parse(report.partyA || "{}") as PartyData;
  const partyB = JSON.parse(report.partyB || "{}") as PartyData;
  const existing = party === "A" ? partyA : partyB;
  if (existing.submittedAt) {
    return NextResponse.json({ error: "this party already submitted" }, { status: 423 });
  }

  // Store this party's own section (merge any prefill + the submitted values).
  const data: PartyData = {
    vehicle: { ...existing.vehicle, ...body.party.vehicle },
    driver: { ...existing.driver, ...body.party.driver },
    submittedAt: at,
    consentAt: at,
    declaredRole: body.party.declaredRole ?? existing.declaredRole,
  };
  setParty(params.reportId, party, data);

  // Party A carries the shared accident details.
  if (party === "A" && body.accident) setAccident(params.reportId, body.accident);

  // Flags — from the shared accident + the (assistive, neutral) photo analysis.
  const accident =
    party === "A" && body.accident
      ? body.accident
      : (JSON.parse(report.accident || "{}") as AccidentData);
  const flags: Flag[] = [];
  if (accident.injuries) flags.push("INJURY");
  if (accident.locationSource === "manual") flags.push("LOC_MANUAL");
  if (accident.photosPending) flags.push("PHOTO_PENDING");
  const photoAnalysis = report.photoAnalysis
    ? (JSON.parse(report.photoAnalysis) as PhotoAnalysis)
    : null;
  const aiFlags = deriveAiFlags(photoAnalysis);
  flags.push(...aiFlags);
  const merged = mergeFlags(JSON.parse(report.flags) as string[], flags);
  setReportFlags(params.reportId, merged);

  // Status: both submitted → complete; injuries/AI → escalated (manual review);
  // otherwise this party is done and we wait for the other (any combination ok).
  const otherDone = party === "A" ? !!partyB.submittedAt : !!partyA.submittedAt;
  const routing = routeOutcome(merged);
  let status: string;
  if (routing === "EMERGENCY") status = "escalated";
  else if (aiFlags.length > 0) status = "escalated";
  else if (otherDone) status = "complete";
  else status = party === "A" ? "partyA_done" : "partyB_done";
  setReportStatus(params.reportId, status as never);

  audit(params.reportId, "party_submitted", at, { party, detail: `status:${status}` });

  const intake = JSON.parse(report.intake || "{}") as Partial<IntakeData>;
  insertFeedEvent({
    kind: "action",
    callId: intake.callId,
    eventType: "party_submitted",
    reportId: params.reportId,
    summary: `Party ${party} submitted ${params.reportId} — status ${status}`,
    payload: { party, status, flags: merged, routing },
    at,
  });

  // The other party's link to share so they can complete their own section.
  const other = party === "A" ? "B" : "A";
  const otherLink = getLinkForParty(params.reportId, other);
  const otherPartyUrl = otherLink
    ? `${baseUrlFromRequest(req)}/r/${otherLink.slug}`
    : null;

  // If the other party hasn't submitted, has a mobile on record, and was never
  // texted (the webhook may have texted them at intake), SMS them their link.
  // Never blocks: failures land on the sms_message row and surface on /phone.
  const otherData = other === "A" ? partyA : partyB;
  const otherMobile = otherData.driver?.mobile;
  if (otherPartyUrl && !otherDone && otherMobile && !hasSmsFor(params.reportId, other)) {
    const sms = await sendSms({
      reportId: params.reportId,
      toParty: other,
      toNumber: otherMobile,
      body: SMS_TEMPLATES.partyLink(params.reportId, otherPartyUrl),
      linkUrl: otherPartyUrl,
    });
    insertFeedEvent({
      kind: "action",
      callId: intake.callId,
      eventType: `sms_party${other}`,
      reportId: params.reportId,
      summary: `Party ${other} link SMS → ${otherMobile} (${sms.provider}: ${sms.status})`,
      payload: { toNumber: otherMobile, provider: sms.provider, status: sms.status, error: sms.error },
      at: new Date().toISOString(),
    });
  }

  // Confirmation "text" to the party who just finished — shows up as a bubble in
  // their own phone frame on /phone. Wording tracks the resulting status.
  const selfMobile = data.driver?.mobile;
  if (selfMobile) {
    const body =
      status === "complete"
        ? SMS_TEMPLATES.reportComplete(params.reportId)
        : status === "escalated"
        ? SMS_TEMPLATES.reportEscalated(params.reportId)
        : SMS_TEMPLATES.partyReceived(params.reportId);
    const sms = await sendSms({
      reportId: params.reportId,
      toParty: party,
      toNumber: selfMobile,
      body,
    });
    insertFeedEvent({
      kind: "action",
      callId: intake.callId,
      eventType: status === "complete" ? "report_complete" : "party_confirmed",
      reportId: params.reportId,
      summary: `Confirmation SMS → Party ${party} ${selfMobile} (${status})`,
      payload: { toNumber: selfMobile, status, provider: sms.provider, smsStatus: sms.status },
      at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    reportId: params.reportId,
    party,
    status,
    flags: merged,
    routing,
    otherPartyUrl,
  });
}
