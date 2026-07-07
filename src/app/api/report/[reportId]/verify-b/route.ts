import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  audit,
  getLink,
  getLinkForParty,
  getReport,
  incVerifyAttempts,
  setPhase,
  setReportFlags,
} from "@/lib/db";
import { mergeFlags } from "@/lib/flags";
import { MAX_VERIFY_RETRIES } from "@/lib/config";
import type { Prefill } from "@/lib/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ slug: z.string(), value: z.string() });

// Normalize a Saudi mobile to its 9 significant digits so "0509876543",
// "+966509876543", "966509876543" and "509876543" all compare equal.
const normalizeMobile = (s: string | undefined) => {
  let d = (s ?? "").replace(/\D/g, "");
  if (d.startsWith("966")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
};
const digits = (s: string | undefined) => (s ?? "").replace(/\D/g, "");

// POST /api/report/:id/verify-b
// Light identity check before Party B's zone opens: B confirms the last digits
// of the mobile the voice agent captured for them (or their plate). On repeated
// failure, falls back to PARTY_B_UNVERIFIED (retry N -> escalate to human).
export async function POST(
  req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const report = getReport(params.reportId);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "slug + value required" }, { status: 422 });

  // Authorized by Party A's device session, only after the handover.
  const aLink = getLink(parsed.data.slug);
  if (!aLink || aLink.reportId !== params.reportId || aLink.party !== "A") {
    return NextResponse.json({ error: "not party A's link" }, { status: 403 });
  }
  if (report.phase !== "handover" && report.phase !== "partyB") {
    return NextResponse.json({ error: "handover not started" }, { status: 409 });
  }

  const bLink = getLinkForParty(params.reportId, "B");
  if (!bLink) return NextResponse.json({ error: "no party B on report" }, { status: 404 });
  const bPrefill = JSON.parse(bLink.prefill) as Prefill;

  // Match B's full captured mobile number (fallback: their plate).
  const at = new Date().toISOString();
  let target: string;
  let supplied: string;
  if (bPrefill.mobile) {
    target = normalizeMobile(bPrefill.mobile);
    supplied = normalizeMobile(parsed.data.value);
  } else {
    // No mobile on file — fall back to matching the plate digits, if any.
    target = digits(bPrefill.plate);
    supplied = digits(parsed.data.value);
  }

  // If nothing on file to match against, accept but record (can't hard-verify).
  const matched = !target || supplied === target;

  if (matched) {
    setPhase(params.reportId, "partyB");
    audit(params.reportId, "b_verified", at, { party: "B" });
    return NextResponse.json({
      ok: true,
      phase: "partyB",
      bSlug: bLink.slug,
      bPrefill,
    });
  }

  const attempts = incVerifyAttempts(params.reportId);
  audit(params.reportId, "b_verify_failed", at, {
    party: "B",
    detail: `attempt ${attempts}`,
  });

  if (attempts >= MAX_VERIFY_RETRIES) {
    const flags = mergeFlags(JSON.parse(report.flags) as string[], [
      "PARTY_B_UNVERIFIED",
    ]);
    setReportFlags(params.reportId, flags);
    audit(params.reportId, "b_verify_escalated", at, { party: "B" });
    return NextResponse.json(
      { ok: false, escalated: true, error: "verification failed — escalated" },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: false,
    remaining: MAX_VERIFY_RETRIES - attempts,
  });
}
