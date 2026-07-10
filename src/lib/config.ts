// Central knobs. In prod these come from env; defaults keep local dev turnkey.

export const HOST_BASE_URL =
  process.env.NAJM_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

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
