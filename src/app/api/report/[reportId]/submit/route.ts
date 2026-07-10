import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { causerSubmitSchema } from "@/lib/schema";
import {
  audit,
  getAffected,
  getLink,
  getReport,
  insertAffected,
  setAccident,
  setCauser,
  setProperties,
  setReportFlags,
  setReportStatus,
} from "@/lib/db";
import { mergeFlags, routeOutcome } from "@/lib/flags";
import { deriveAiFlags } from "@/lib/photoAnalysis";
import { newSlug } from "@/lib/slug";
import { HOST_BASE_URL } from "@/lib/config";
import type { CauserData, Flag, PhotoAnalysis } from "@/lib/types";

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

  // Insert affected parties (added by lookup) + mint an ack link for each.
  const affectedUrls: { url: string; name?: string }[] = [];
  body.affected.forEach((a, i) => {
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
    affectedUrls.push({ url: `${HOST_BASE_URL}/r/${ackSlug}`, name: a.driver.fullName });
  });

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

  return NextResponse.json({
    ok: true,
    reportId: params.reportId,
    status,
    flags: merged,
    routing,
    affected: affectedUrls,
  });
}
