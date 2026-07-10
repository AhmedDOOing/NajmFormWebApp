import { NextRequest, NextResponse } from "next/server";
import { HAMSA_WEBHOOK_SECRET } from "@/lib/config";
import {
  extractCallData,
  hamsaEnvelopeSchema,
  mapOutcome,
  summarizeEvent,
} from "@/lib/hamsa";
import { findMintedByCallId, insertFeedEvent } from "@/lib/db";
import { createSession } from "@/lib/session";
import { sendSms, SMS_TEMPLATES } from "@/lib/sms";

export const dynamic = "force-dynamic";

// Fallback demo number when the call didn't capture the causer's mobile —
// keeps the /phone simulator demo working with sparse payloads.
const DEMO_CAUSER_NUMBER = "+9665XXXXXXXX";

// POST /api/webhook/hamsa — Hamsa's call-lifecycle webhook.
// Every event is recorded to the live feed; only `call.ended` mints a report +
// causer filing link and sends the SMS. Idempotent per callId: Hamsa's retry
// behavior is undocumented, so replays return the originally minted link.
export async function POST(req: NextRequest) {
  // Bearer auth (configured on the Hamsa agent). If no secret is set we accept
  // unauthenticated posts — local dev / demo only.
  if (HAMSA_WEBHOOK_SECRET) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token !== HAMSA_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const raw = await req.json().catch(() => null);
  const at = new Date().toISOString();

  // Lenient parse — a malformed body still lands in the feed for debugging.
  const parsed = hamsaEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    insertFeedEvent({
      kind: "webhook",
      eventType: "unparseable",
      summary: "Webhook received but body was not a recognizable Hamsa envelope",
      payload: (raw ?? {}) as object,
      at,
    });
    return NextResponse.json({ ok: true, note: "recorded (unparseable)" });
  }
  const envelope = parsed.data;

  insertFeedEvent({
    kind: "webhook",
    callId: envelope.callId,
    eventType: envelope.eventType,
    summary: summarizeEvent(envelope),
    payload: envelope as object,
    at,
  });

  if (envelope.eventType !== "call.ended") {
    return NextResponse.json({ ok: true, recorded: envelope.eventType });
  }

  // --- call.ended → mint the causer's filing link --------------------------

  // Idempotency: a replayed call.ended returns the link minted the first time.
  if (envelope.callId) {
    const prior = findMintedByCallId(envelope.callId);
    if (prior?.reportId) {
      const detail = JSON.parse(prior.payload) as { url?: string };
      return NextResponse.json({
        ok: true,
        reportId: prior.reportId,
        url: detail.url,
        idempotent: true,
      });
    }
  }

  const { outcomeResult } = extractCallData(envelope);
  const { causer, intake, ignoredKeys } = mapOutcome(
    outcomeResult ?? {},
    envelope.callId
  );

  const session = createSession({ causer, intake });

  insertFeedEvent({
    kind: "action",
    callId: envelope.callId,
    eventType: "link_minted",
    reportId: session.reportId,
    summary: `Report ${session.reportId} created — causer filing link minted`,
    payload: {
      url: session.causer.url,
      mappedCauser: causer,
      intake,
      ignoredKeys,
    },
    at: new Date().toISOString(),
  });

  // SMS the filing link to the causer. Never blocks: failures are recorded on
  // the sms_message row and shown on /phone.
  const toNumber = causer.driver.mobile || DEMO_CAUSER_NUMBER;
  const sms = await sendSms({
    reportId: session.reportId,
    toParty: "causer",
    toNumber,
    body: SMS_TEMPLATES.causerFiling(session.reportId, session.causer.url),
    linkUrl: session.causer.url,
  });

  insertFeedEvent({
    kind: "action",
    callId: envelope.callId,
    eventType: "sms_causer",
    reportId: session.reportId,
    summary: `Filing link SMS → ${toNumber} (${sms.provider}: ${sms.status})`,
    payload: { toNumber, provider: sms.provider, status: sms.status, error: sms.error },
    at: new Date().toISOString(),
  });

  return NextResponse.json(
    {
      ok: true,
      reportId: session.reportId,
      url: session.causer.url,
      expiresAt: session.expiresAt,
      sms: { toNumber, provider: sms.provider, status: sms.status },
      ignoredKeys,
    },
    { status: 201 }
  );
}
