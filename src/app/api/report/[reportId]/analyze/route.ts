import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit, getLink, getReport, setPhotoAnalysis } from "@/lib/db";
import {
  analyzePhotos,
  deriveAiFlags,
  type AnalysisContext,
  type AnalysisImage,
} from "@/lib/photoAnalysis";
import type { AccidentData, PartyData } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_IMAGES = 6;

const bodySchema = z.object({
  slug: z.string(),
  images: z
    .array(
      z.object({
        base64: z.string().min(1),
        mediaType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
      })
    )
    .min(1)
    .max(MAX_IMAGES),
  // Optional context from the client — the accident step runs analysis BEFORE
  // the causer submits, so the report row isn't populated yet. When present this
  // wins; otherwise we fall back to whatever is already stored.
  context: z
    .object({
      causerVehicle: z.string().optional(),
      affectedVehicles: z.array(z.string()).optional(),
      accidentDateTime: z.string().optional(),
      injuries: z.boolean().optional(),
      properties: z.array(z.string()).optional(),
    })
    .optional(),
});

// POST /api/report/:id/analyze — SERVER-SIDE AI photo analysis (assistive).
// Runs live on the accident step as photos are added. It ONLY stores the
// structured result; it never changes report flags/status. The authoritative
// routing (including the assistive AI flags) is applied once, on /submit.
export async function POST(
  req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const report = getReport(params.reportId);
  if (!report)
    return NextResponse.json({ error: "report not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { slug, images } = parsed.data;

  // Party A (who captures the shared accident details) triggers analysis.
  const link = getLink(slug);
  if (!link || link.reportId !== params.reportId || link.party !== "A") {
    return NextResponse.json({ error: "not Party A's link" }, { status: 403 });
  }

  // Prefer client-supplied context (accident step, pre-submit); else derive from
  // whatever the report row already holds.
  let ctx: AnalysisContext;
  if (parsed.data.context) {
    ctx = parsed.data.context;
  } else {
    const partyA = JSON.parse(report.partyA || "{}") as PartyData;
    const partyB = JSON.parse(report.partyB || "{}") as PartyData;
    const accident = JSON.parse(report.accident || "{}") as AccidentData;
    const bVeh = [partyB.vehicle?.number, partyB.vehicle?.registrationType]
      .filter(Boolean)
      .join(" · ");
    ctx = {
      partyAVehicle: [partyA.vehicle?.number, partyA.vehicle?.registrationType]
        .filter(Boolean)
        .join(" · "),
      partyBVehicles: bVeh ? [bVeh] : [],
      accidentDateTime: accident.dateTime,
      injuries: accident.injuries,
    };
  }

  const raw = await analyzePhotos(images as AnalysisImage[], ctx);
  // Stamp the report id so the stored record is self-contained (portable to its
  // own table later without needing the surrounding report row).
  const analysis = { ...raw, reportId: params.reportId };
  setPhotoAnalysis(params.reportId, analysis);

  audit(
    params.reportId,
    analysis.status === "failed" ? "photo_analysis_failed" : "photo_analysis_complete",
    analysis.at,
    {
      party: "A",
      detail: `model:${analysis.modelVersion} images:${analysis.imageCount}${
        analysis.error ? ` error:${analysis.error}` : ""
      }`,
    }
  );

  return NextResponse.json({
    ok: true,
    reportId: params.reportId,
    // Preview only — the report's real routing is decided on /submit.
    aiFlags: deriveAiFlags(analysis),
    analysis,
  });
}
