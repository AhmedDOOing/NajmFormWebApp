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
  partyAVehicle?: string; // free-text describing Party A's vehicle
  partyBVehicles?: string[]; // Party B's vehicle(s)
  accidentDateTime?: string;
  injuries?: boolean;
  properties?: string[]; // property items reported as hit
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
  imageQualityIssues: z.array(z.string()),
  limitations: z.string(),
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
      imageQualityIssues: {
        type: "array",
        items: { type: "string" },
        description:
          "Overall photo-quality problems that warrant retaking photos; empty if none.",
      },
      limitations: {
        type: "string",
        description:
          "What the photos alone cannot establish (speed, right-of-way, signal state, sequence of events). Do NOT assign fault to any party.",
      },
    },
    required: [
      "perImage",
      "damageSummary",
      "consistency",
      "imageQualityIssues",
      "limitations",
    ],
  },
};

const SYSTEM_PROMPT = `You are an assistive vision reviewer for a traffic-accident reporting service. You produce a PRELIMINARY, NEUTRAL analysis of accident scene photos to help a HUMAN adjuster — you are NOT the decision maker.

Absolute rules:
- Stay completely NEUTRAL. Do NOT assign, suggest, or imply fault, blame, or liability to any party. Never use words like "at-fault", "caused", "offender", or "victim". Describe only what is visible.
- Photos alone cannot establish speed, right-of-way, signal state, or the sequence of events. Say so in "limitations".
- Only report discrepancies you can actually see in the images. If the visible damage plausibly fits the reported account, set consistency.matchesDescription = true with an empty discrepancies list.
- Respond ONLY by calling the record_analysis tool. Do not write prose.
- Be concise: keep damageSummary to 2-4 sentences and per-image descriptions to one short sentence. Brevity keeps this fast for a roadside user.`;

function buildPromptText(ctx: AnalysisContext, imageCount: number): string {
  const lines = [
    `There are ${imageCount} accident scene photo(s), indexed 0..${imageCount - 1}.`,
    `Describe the visible damage and flag anything inconsistent with the reported account for a human reviewer. Remain neutral — do not assign fault to any party.`,
  ];
  if (ctx.partyAVehicle) lines.push(`Reported Party A vehicle: ${ctx.partyAVehicle}.`);
  if (ctx.partyBVehicles?.length)
    lines.push(`Reported Party B vehicle(s): ${ctx.partyBVehicles.join("; ")}.`);
  if (ctx.properties?.length)
    lines.push(`Reported damaged property: ${ctx.properties.join("; ")}.`);
  if (ctx.accidentDateTime) lines.push(`Reported date/time: ${ctx.accidentDateTime}.`);
  if (ctx.injuries) lines.push(`Injuries were reported.`);
  lines.push(`Analyze the photos and record your neutral, preliminary findings via record_analysis.`);
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
    imageQualityIssues: [],
    limitations: "Analysis was not performed; a human review is required.",
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

// Assistive flag derived from a completed analysis. Single source of truth —
// used by the /submit route to route to manual review. Neutral: only flags a
// damage/account inconsistency; never assigns fault.
export function deriveAiFlags(analysis: PhotoAnalysis | null): Flag[] {
  if (!analysis || analysis.status !== "complete" || !analysis.result) return [];
  const r = analysis.result;
  const out: Flag[] = [];
  if (!r.consistency.matchesDescription || r.consistency.discrepancies.length > 0)
    out.push("AI_DAMAGE_INCONSISTENT");
  return out;
}
