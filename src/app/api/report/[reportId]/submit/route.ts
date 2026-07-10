import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { causerSubmitSchema } from "@/lib/schema";
import {
  audit,
  getLink,
  getReport,
  insertAffected,
  insertFeedEvent,
  setAccident,
  setCauser,
  setProperties,
  setReportFlags,
  setReportStatus,
} from "@/lib/db";
import { mergeFlags, routeOutcome } from "@/lib/flags";
import { deriveAiFlags } from "@/lib/photoAnalysis";
import { sendSms, SMS_TEMPLATES } from "@/lib/sms";
import { newSlug } from "@/lib/slug";
import { HOST_BASE_URL } from "@/lib/config";
import type { CauserData, Flag, IntakeData, PhotoAnalysis } from "@/lib/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ slug: z.string() }).and(causerSubmitSchema);

// POST /api/report/:id/submit — the CAUSER files the whole report + signs the
// fault declaration. Generates an acknowledgment link per affected party.
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

  // Only the causer's own link may file. (Affected parties never file.)
  const link = getLink(body.slug);
  if (!link || link.reportId !== params.reportId || link.party !== "A") {
    return NextResponse.json({ error: "not the causer's link" }, { status: 403 });
  }

  // Fault declaration is required (schema enforces literal true) and is a
  // discrete, timestamped admission + consent.
  const now = new Date();
  const at = now.toISOString();

  // Causer already filed? locked.
  const existing = JSON.parse(report.causer || "{}") as CauserData;
  if (existing.faultDeclaration?.accepted) {
    return NextResponse.json({ error: "report already filed" }, { status: 423 });
  }

  // Persist causer (merge session details + any edits) + declaration.
  const causer: CauserData = {
    vehicle: { ...existing.vehicle, ...body.causer?.vehicle },
    driver: { ...existing.driver, ...body.causer?.driver },
    faultDeclaration: { accepted: true, at },
  };
  setCauser(params.reportId, causer);
  setAccident(params.reportId, body.accident);
  setProperties(params.reportId, body.properties);

  // Insert affected parties (added by lookup) + mint an ack link for each, and
  // SMS it to them (simulated or real — never blocks the request; failures are
  // recorded on the sms_message row and surface on /phone).
  const intake = JSON.parse(report.intake || "{}") as Partial<IntakeData>;
  const affectedUrls: { url: string; name?: string }[] = [];
  for (let i = 0; i < body.affected.length; i++) {
    const a = body.affected[i];
    const ackSlug = newSlug();
    insertAffected({
      reportId: params.reportId,
      idx: i,
      vehicle: a.vehicle,
      driver: a.driver,
      ackSlug,
      lookupFailed: !!a.lookupFailed,
      addedAt: at,
    });
    const url = `${HOST_BASE_URL}/r/${ackSlug}`;
    affectedUrls.push({ url, name: a.driver.fullName });

    const toNumber = a.driver.mobile || intake.otherPartyMobile;
    if (toNumber) {
      const sms = await sendSms({
        reportId: params.reportId,
        toParty: "affected",
        toNumber,
        body: SMS_TEMPLATES.affectedAck(params.reportId, url),
        linkUrl: url,
      });
      insertFeedEvent({
        kind: "action",
        callId: intake.callId,
        eventType: "sms_affected",
        reportId: params.reportId,
        summary: `Ack link SMS → ${a.driver.fullName || toNumber} (${sms.provider}: ${sms.status})`,
        payload: { toNumber, url, provider: sms.provider, status: sms.status, error: sms.error },
        at: new Date().toISOString(),
      });
    }
  }

  // Compute flags.
  const flags: Flag[] = [];
  if (body.accident.injuries) flags.push("INJURY");
  if (body.affected.length === 0 && body.properties.length > 0)
    flags.push("PROPERTY_ONLY");
  if (body.affected.some((a) => a.lookupFailed)) flags.push("AFFECTED_LOOKUP_FAILED");
  if (body.accident.locationSource === "manual") flags.push("LOC_MANUAL");
  if (body.accident.photosPending) flags.push("PHOTO_PENDING");
  // Assistive AI flags from the photo analysis that already ran on the accident
  // step (stored on the report). Applied here so routing is decided in one place.
  const photoAnalysis = report.photoAnalysis
    ? (JSON.parse(report.photoAnalysis) as PhotoAnalysis)
    : null;
  const aiFlags = deriveAiFlags(photoAnalysis);
  flags.push(...aiFlags);
  const merged = mergeFlags(JSON.parse(report.flags) as string[], flags);
  setReportFlags(params.reportId, merged);

  // Status: emergency overrides; any AI signal holds the report for a human
  // (never auto-completes on the AI output); otherwise "filed" while awaiting
  // acks, or "complete" when there are no affected parties to acknowledge.
  const routing = routeOutcome(merged);
  let status: string;
  if (routing === "EMERGENCY") status = "escalated";
  else if (aiFlags.length > 0) status = "escalated";
  else if (body.affected.length === 0) status = "complete";
  else status = "filed";
  setReportStatus(params.reportId, status as never);

  audit(params.reportId, "causer_filed", at, {
    party: "A",
    detail: `affected:${body.affected.length} properties:${body.properties.length}`,
  });
  audit(params.reportId, "fault_declaration_signed", at, { party: "A" });
  insertFeedEvent({
    kind: "action",
    callId: intake.callId,
    eventType: "report_filed",
    reportId: params.reportId,
    summary: `Causer filed ${params.reportId} — status ${status}, ${body.affected.length} affected, ${body.properties.length} properties`,
    payload: { status, flags: merged, routing },
    at,
  });

  return NextResponse.json({
    ok: true,
    reportId: params.reportId,
    status,
    flags: merged,
    routing,
    affected: affectedUrls,
  });
}
