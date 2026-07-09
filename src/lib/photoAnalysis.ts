// ===========================================================================
// AI Photo Analysis — SERVER-SIDE ONLY.
//
// This module runs a Claude vision call over the accident scene photos and
// returns a strict-JSON, human-reviewed *preliminary* read. Hard rules:
//   • The Anthropic API key NEVER leaves the server. This file is imported only
//     by the /analyze route handler; images arrive as base64 in the request
//     body and the raw bytes are never persisted or echoed to the client.
//   • The output is ASSISTIVE, not authoritative. It does not decide or
//     "confirm" fault. Every AI signal routes to manual review (see flags.ts).
//   • On any failure (API error, bad JSON) we retry once, then return
//     status:"failed" so the caller still routes the report to a human.
//
// When ANTHROPIC_API_KEY is unset we return a clearly-marked `stub` result so
// the whole flow stays testable in dev (mirrors the registry-lookup stub).
// >>> CLIENT-CONFIRMATION ITEM: set ANTHROPIC_API_KEY in prod. <<<
// ===========================================================================

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Flag, PhotoAnalysis, PhotoAnalysisResult } from "./types";

const MODEL = "claude-sonnet-5";

// Below this, a fault indication is treated as "undetermined" and never raises
// AI_FAULT_MISMATCH (see the route). Assistive tools must not over-claim.
export const FAULT_CONFIDENCE_THRESHOLD = 0.6;

export type AnalysisMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export interface AnalysisImage {
  base64: string;
  mediaType: AnalysisMediaType;
}

export interface AnalysisContext {
  causerVehicle?: string; // free-text describing the at-fault vehicle
  affectedVehicles?: string[]; // the other party's vehicle(s)
  accidentDateTime?: string;
  injuries?: boolean;
  properties?: string[]; // property items the causer said were hit
}

// zod guard — validates whatever the model produced before we trust it.
const resultSchema = z.object({
  perImage: z.array(
    z.object({
      index: z.number().int(),
      description: z.string(),
      damageAreas: z.array(z.string()),
      qualityIssue: z.string(),
    })
  ),
  damageSummary: z.string(),
  consistency: z.object({
    matchesDescription: z.boolean(),
    discrepancies: z.array(z.string()),
  }),
  faultIndication: z.object({
    party: z.enum(["A", "B", "shared", "undetermined"]),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    limitations: z.string(),
  }),
  imageQualityIssues: z.array(z.string()),
});

// Forced tool call → guarantees Claude returns exactly this shape (strict).
const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "record_analysis",
  description:
    "Record the preliminary, human-reviewed analysis of the accident scene photos.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      perImage: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            index: { type: "integer", description: "0-based image index" },
            description: {
              type: "string",
              description: "What the photo shows (vehicles, scene, angle).",
            },
            damageAreas: {
              type: "array",
              items: { type: "string" },
              description: "Visible damaged areas, e.g. 'front-left bumper'.",
            },
            qualityIssue: {
              type: "string",
              description:
                "Any issue limiting analysis (blur, glare, dark, cropped); empty string if none.",
            },
          },
          required: ["index", "description", "damageAreas", "qualityIssue"],
        },
      },
      damageSummary: {
        type: "string",
        description: "Plain-language summary of the visible damage across photos.",
      },
      consistency: {
        type: "object",
        additionalProperties: false,
        properties: {
          matchesDescription: {
            type: "boolean",
            description:
              "Does the visible damage plausibly match the reported account? Use true when nothing contradicts it.",
          },
          discrepancies: {
            type: "array",
            items: { type: "string" },
            description: "Concrete inconsistencies you can see; empty if none.",
          },
        },
        required: ["matchesDescription", "discrepancies"],
      },
      faultIndication: {
        type: "object",
        additionalProperties: false,
        properties: {
          party: {
            type: "string",
            enum: ["A", "B", "shared", "undetermined"],
            description:
              "Which party the physical evidence *suggests* is at fault. A = the driver who admitted fault (causer). B = the other/affected party. Use 'undetermined' whenever photos cannot support a confident read (this is the common, safe answer).",
          },
          confidence: {
            type: "number",
            description: "0..1 confidence in `party`. Be conservative.",
          },
          reasoning: {
            type: "string",
            description: "Brief basis for the indication, grounded in the images.",
          },
          limitations: {
            type: "string",
            description:
              "What the photos cannot establish (speed, right-of-way, signals, sequence).",
          },
        },
        required: ["party", "confidence", "reasoning", "limitations"],
      },
      imageQualityIssues: {
        type: "array",
        items: { type: "string" },
        description:
          "Overall photo-quality problems that warrant retaking photos; empty if none.",
      },
    },
    required: [
      "perImage",
      "damageSummary",
      "consistency",
      "faultIndication",
      "imageQualityIssues",
    ],
  },
};

const SYSTEM_PROMPT = `You are an assistive vision reviewer for a traffic-accident reporting service. You produce a PRELIMINARY analysis of accident scene photos to help a HUMAN adjuster — you are NOT the decision maker.

Absolute rules:
- You do NOT decide, confirm, or settle fault or liability. You describe what is visible and flag inconsistencies.
- Photos alone cannot establish speed, right-of-way, signal state, or the sequence of events. Say so in "limitations".
- Prefer "undetermined" for faultIndication.party and a low confidence whenever the images do not clearly support a read. Over-claiming is worse than under-claiming.
- Party mapping: A = the driver who signed the fault declaration (the causer). B = the other/affected party.
- Only report discrepancies you can actually see in the images. If the damage plausibly fits the account, set consistency.matchesDescription = true with an empty discrepancies list.
- Respond ONLY by calling the record_analysis tool. Do not write prose.
- Be concise: keep damageSummary to 2-4 sentences and per-image descriptions to one short sentence. Brevity keeps this fast for a roadside user.`;

function buildPromptText(ctx: AnalysisContext, imageCount: number): string {
  const lines = [
    `There are ${imageCount} accident scene photo(s), indexed 0..${imageCount - 1}.`,
    `The causer (Party A) has ADMITTED fault. Your job is to describe visible damage and flag anything inconsistent for a human reviewer — not to confirm or overturn that admission.`,
  ];
  if (ctx.causerVehicle) lines.push(`Reported causer (A) vehicle: ${ctx.causerVehicle}.`);
  if (ctx.affectedVehicles?.length)
    lines.push(`Reported affected (B) vehicle(s): ${ctx.affectedVehicles.join("; ")}.`);
  if (ctx.properties?.length)
    lines.push(`Reported damaged property: ${ctx.properties.join("; ")}.`);
  if (ctx.accidentDateTime) lines.push(`Reported date/time: ${ctx.accidentDateTime}.`);
  if (ctx.injuries) lines.push(`Injuries were reported.`);
  lines.push(`Analyze the photos and record your preliminary findings via record_analysis.`);
  return lines.join("\n");
}

// A clearly-marked stub used when no API key is configured. It never fabricates
// fault (party = undetermined) so the dev flow stays honest.
function stubAnalysis(imageCount: number, at: string): PhotoAnalysis {
  const result: PhotoAnalysisResult = {
    perImage: Array.from({ length: imageCount }, (_, i) => ({
      index: i,
      description: "Stub: image received (no model configured in this environment).",
      damageAreas: [],
      qualityIssue: "",
    })),
    damageSummary:
      "Preliminary analysis unavailable in this environment (ANTHROPIC_API_KEY not set). This is a placeholder for a human reviewer.",
    consistency: { matchesDescription: true, discrepancies: [] },
    faultIndication: {
      party: "undetermined",
      confidence: 0,
      reasoning: "No model available to analyze the images.",
      limitations: "Analysis was not performed; a human review is required.",
    },
    imageQualityIssues: [],
  };
  return { status: "complete", modelVersion: "stub", at, imageCount, result };
}

export async function analyzePhotos(
  images: AnalysisImage[],
  ctx: AnalysisContext
): Promise<PhotoAnalysis> {
  const at = new Date().toISOString();
  const imageCount = images.length;
  if (imageCount === 0)
    return { status: "skipped", modelVersion: "none", at, imageCount };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return stubAnalysis(imageCount, at);

  const client = new Anthropic({ apiKey });
  const content: Anthropic.ContentBlockParam[] = [
    ...images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      })
    ),
    { type: "text", text: buildPromptText(ctx, imageCount) },
  ];

  let lastErr = "unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await client.messages.create({
        model: MODEL,
        // Scale the output cap to the image count — smaller cap = faster
        // generation. Concise-output prompt keeps well within this.
        max_tokens: Math.min(4096, 1024 + imageCount * 400),
        // Sonnet 5 runs adaptive thinking by default, which is incompatible with
        // a forced tool call — disable it for this deterministic extraction.
        thinking: { type: "disabled" },
        system: SYSTEM_PROMPT,
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: "tool", name: "record_analysis" },
        messages: [{ role: "user", content }],
      });
      const block = resp.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      if (!block) throw new Error("model did not call record_analysis");
      const parsed = resultSchema.safeParse(block.input);
      if (!parsed.success) throw new Error(`schema mismatch: ${parsed.error.message}`);
      return {
        status: "complete",
        modelVersion: MODEL,
        at,
        imageCount,
        result: parsed.data,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    status: "failed",
    modelVersion: MODEL,
    at,
    imageCount,
    error: lastErr.slice(0, 300),
  };
}

// Assistive flags derived from a completed analysis. Single source of truth —
// used by the /submit route to apply routing. Never confirms fault: an
// undetermined / low-confidence read raises nothing.
export function deriveAiFlags(analysis: PhotoAnalysis | null): Flag[] {
  if (!analysis || analysis.status !== "complete" || !analysis.result) return [];
  const r = analysis.result;
  const out: Flag[] = [];
  if (!r.consistency.matchesDescription || r.consistency.discrepancies.length > 0)
    out.push("AI_DAMAGE_INCONSISTENT");
  if (
    r.faultIndication.party === "B" &&
    r.faultIndication.confidence >= FAULT_CONFIDENCE_THRESHOLD
  )
    out.push("AI_FAULT_MISMATCH");
  return out;
}
