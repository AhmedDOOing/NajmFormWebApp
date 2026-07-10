import { NextRequest, NextResponse } from "next/server";
import { baseUrlFromRequest, HAMSA_WEBHOOK_SECRET } from "@/lib/config";
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

// Fallback demo number when the call didn't capture Party A's mobile —
// keeps the /phone simulator demo working with sparse payloads.
const DEMO_PARTY_A_NUMBER = "+9665XXXXXXXX";

// POST /api/webhook/hamsa — Hamsa's call-lifecycle webhook.
// Every event is recorded to the live feed; only `call.ended` mints a report +
// the two party links, then SMSes each party whose mobile the call captured.
// Idempotent per callId: Hamsa's retry behavior is undocumented, so replays
// return the originally minted links.
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

  // --- call.ended → mint the two party links -------------------------------

  // Idempotency: a replayed call.ended returns the links minted the first time.
  if (envelope.callId) {
    const prior = findMintedByCallId(envelope.callId);
    if (prior?.reportId) {
      const detail = JSON.parse(prior.payload) as {
        partyAUrl?: string;
        partyBUrl?: string;
      };
      return NextResponse.json({
        ok: true,
        reportId: prior.reportId,
        partyA: { url: detail.partyAUrl },
        partyB: { url: detail.partyBUrl },
        idempotent: true,
      });
    }
  }

  const { outcomeResult } = extractCallData(envelope);
  const { partyA, partyB, intake, ignoredKeys } = mapOutcome(
    outcomeResult ?? {},
    envelope.callId
  );

  // Party A's PartyData carries the declared role if the call captured it.
  const session = createSession(
    {
      partyA: {
        vehicle: partyA.vehicle,
        driver: partyA.driver,
        declaredRole: partyA.declaredRole,
      },
      partyB,
      intake,
    },
    baseUrlFromRequest(req)
  );

  insertFeedEvent({
    kind: "action",
    callId: envelope.callId,
    eventType: "link_minted",
    reportId: session.reportId,
    summary: `Report ${session.reportId} created — Party A${partyB ? " + Party B" : ""} link${partyB ? "s" : ""} minted`,
    payload: {
      partyAUrl: session.partyA.url,
      partyBUrl: session.partyB.url,
      url: session.partyA.url, // feed panel renders this line
      mapped: { partyA, partyB },
      intake,
      ignoredKeys,
    },
    at: new Date().toISOString(),
  });

  // SMS each party whose mobile the call captured. Never blocks: failures are
  // recorded on the sms_message row and shown on /phone.
  const sends: { party: "A" | "B"; toNumber: string; url: string }[] = [
    {
      party: "A" as const,
      toNumber: partyA.driver.mobile || DEMO_PARTY_A_NUMBER,
      url: session.partyA.url,
    },
    ...(partyB?.driver.mobile
      ? [{ party: "B" as const, toNumber: partyB.driver.mobile, url: session.partyB.url }]
      : []),
  ];

  const smsResults = [];
  for (const send of sends) {
    const sms = await sendSms({
      reportId: session.reportId,
      toParty: send.party,
      toNumber: send.toNumber,
      body: SMS_TEMPLATES.partyLink(session.reportId, send.url),
      linkUrl: send.url,
    });
    insertFeedEvent({
      kind: "action",
      callId: envelope.callId,
      eventType: `sms_party${send.party}`,
      reportId: session.reportId,
      summary: `Party ${send.party} link SMS → ${send.toNumber} (${sms.provider}: ${sms.status})`,
      payload: { toNumber: send.toNumber, provider: sms.provider, status: sms.status, error: sms.error },
      at: new Date().toISOString(),
    });
    smsResults.push({ party: send.party, toNumber: send.toNumber, ...sms });
  }

  return NextResponse.json(
    {
      ok: true,
      reportId: session.reportId,
      partyA: { url: session.partyA.url },
      partyB: { url: session.partyB.url },
      expiresAt: session.expiresAt,
      sms: smsResults,
      ignoredKeys,
    },
    { status: 201 }
  );
}
