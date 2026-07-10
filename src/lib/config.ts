// Central knobs. In prod these come from env; defaults keep local dev turnkey.

export const HOST_BASE_URL =
  process.env.NAJM_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// Build the public base URL from the incoming request's Host header, so minted
// links point back at whatever origin the user actually loaded (localhost on the
// dev machine, the LAN IP on a phone). Falls back to HOST_BASE_URL.
export function baseUrlFromRequest(req: {
  headers: { get(name: string): string | null };
}): string {
  const host = req.headers.get("host");
  if (!host) return HOST_BASE_URL;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// How long a freshly minted link stays valid (ms). Voice agent can override via ttl.
export const DEFAULT_LINK_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export const SLUG_LENGTH = 10;

// Bearer secret Hamsa is configured to send on webhook POSTs. When unset the
// webhook accepts unauthenticated requests (local dev / demo only — set it in
// any shared environment).
export const HAMSA_WEBHOOK_SECRET = process.env.HAMSA_WEBHOOK_SECRET || "";

// Twilio (optional). When all three are set, sendSms() attempts a real API
// send; otherwise SMS delivery is simulated and only shown on /phone.
export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
export const TWILIO_FROM = process.env.TWILIO_FROM || "";
