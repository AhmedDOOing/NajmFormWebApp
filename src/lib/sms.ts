import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } from "./config";
import { insertSms, type SmsRow } from "./db";

// ---------------------------------------------------------------------------
// SMS delivery — simulated-first. Every message is recorded in sms_message
// (that's what the /phone simulator renders); if the three TWILIO_* env vars
// are set we ALSO attempt a real send via Twilio's REST API and record the
// result. Failures are recorded, never thrown — SMS must never block the flow.
// ---------------------------------------------------------------------------

export interface SendSmsInput {
  reportId?: string;
  toParty: "A" | "B";
  toNumber: string;
  body: string;
  linkUrl?: string;
}

export interface SendSmsResult {
  id: number;
  provider: SmsRow["provider"];
  status: SmsRow["status"];
  error?: string;
}

// Bilingual message templates. The link is appended on its own line.
export const SMS_TEMPLATES = {
  partyLink: (reportId: string, url: string) =>
    `نجم: أكمل بيانات بلاغ الحادث ${reportId} عبر الرابط\nNajm: complete your side of accident report ${reportId}\n${url}`,
} as const;

const twilioConfigured = () =>
  Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM);

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const at = new Date().toISOString();

  if (!twilioConfigured()) {
    const id = insertSms({
      ...input,
      provider: "simulated",
      status: "simulated",
      at,
    });
    return { id, provider: "simulated", status: "simulated" };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: input.toNumber,
          From: TWILIO_FROM,
          Body: input.body,
        }),
      }
    );
    const j = (await res.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      message?: string;
    };
    if (!res.ok) {
      const error = j.message || `Twilio HTTP ${res.status}`;
      const id = insertSms({ ...input, provider: "twilio", status: "failed", error, at });
      return { id, provider: "twilio", status: "failed", error };
    }
    const status = j.status === "sent" ? "sent" : "queued";
    const id = insertSms({
      ...input,
      provider: "twilio",
      providerSid: j.sid,
      status,
      at,
    });
    return { id, provider: "twilio", status };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const id = insertSms({ ...input, provider: "twilio", status: "failed", error, at });
    return { id, provider: "twilio", status: "failed", error };
  }
}
