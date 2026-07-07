import { DEFAULT_LINK_TTL_MS, HOST_BASE_URL } from "./config";
import {
  audit,
  getReport,
  insertLink,
  insertReport,
} from "./db";
import { newReportId, newSlug } from "./slug";
import type { Party, Prefill } from "./types";

export interface CreateSessionInput {
  reportId?: string;
  ttl?: number; // ms
  prefill: { A: Prefill; B: Prefill };
}

export interface CreateSessionResult {
  reportId: string;
  partyA: { url: string; slug: string };
  partyB: { url: string; slug: string };
  expiresAt: string;
}

// Mints one report + TWO opaque slugs (one per party). Each party's predefined
// payload is stored server-side against its slug — the slug carries NO PII.
export function createSession(input: CreateSessionInput): CreateSessionResult {
  const now = new Date();
  const ttl = input.ttl ?? DEFAULT_LINK_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl).toISOString();
  const createdAt = now.toISOString();

  let reportId = input.reportId;
  if (!reportId) reportId = newReportId();
  if (getReport(reportId)) {
    // Extremely unlikely collision on the random id; regenerate once.
    reportId = newReportId();
  }

  insertReport({ reportId, createdAt, expiresAt });
  audit(reportId, "session_created", createdAt);

  const mint = (party: Party, prefill: Prefill) => {
    const slug = newSlug();
    insertLink({
      slug,
      reportId: reportId!,
      party,
      prefill: JSON.stringify(prefill ?? {}),
      usedAt: null,
      expiresAt,
    });
    return { slug, url: `${HOST_BASE_URL}/r/${slug}` };
  };

  const a = mint("A", input.prefill.A ?? {});
  const b = mint("B", input.prefill.B ?? {});

  return {
    reportId,
    partyA: a,
    partyB: b,
    expiresAt,
  };
}
