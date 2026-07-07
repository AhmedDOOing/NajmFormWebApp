// Central knobs. In prod these come from env; defaults keep local dev turnkey.

export const HOST_BASE_URL =
  process.env.NAJM_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// How long a freshly minted link stays valid (ms). Voice agent can override via ttl.
export const DEFAULT_LINK_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Report-level SLA: how long we wait for Party B to *ever* join before we flag
// PARTY_B_TIMEOUT and allow Party-A-only progression.
export const PARTY_B_SLA_MS = Number(process.env.NAJM_PARTY_B_SLA_MS) || 15 * 60 * 1000; // 15 min

// After a socket disconnects, how long before we broadcast `absent` (survives
// dropped mobile connections / tunnel switches).
export const DISCONNECT_GRACE_MS = Number(process.env.NAJM_GRACE_MS) || 60 * 1000; // 60s

// Identity verification retries before falling back to a human agent.
export const MAX_VERIFY_RETRIES = Number(process.env.NAJM_MAX_VERIFY_RETRIES) || 3;

export const SLUG_LENGTH = 10;
