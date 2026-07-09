import { DEFAULT_LINK_TTL_MS, HOST_BASE_URL } from "./config";
import { audit, getReport, insertLink, insertReport, setParty } from "./db";
import { newReportId, newSlug } from "./slug";
import type { DriverInfo, VehicleInfo } from "./types";

type PartyPrefill = { vehicle?: Partial<VehicleInfo>; driver?: Partial<DriverInfo> };

export interface CreateSessionInput {
  reportId?: string;
  ttl?: number; // ms
  // Whatever the voice call captured. Any subset is fine: Party A only, Party A
  // + Party B's phone (to text B their link), or both parties' details.
  partyA?: PartyPrefill;
  partyB?: PartyPrefill;
  causer?: PartyPrefill; // legacy alias for partyA
}

export interface CreateSessionResult {
  reportId: string;
  partyA: { url: string; slug: string };
  partyB: { url: string; slug: string };
  expiresAt: string;
}

// Neutral two-party model: mint one report + TWO opaque links (Party A and
// Party B). Either can start; each party fills only their own section. The slug
// carries NO PII — party details live server-side, SSR'd only to the link holder.
// `baseUrl` (from the incoming request's host) makes the links reachable from
// wherever the page was actually opened (localhost on the Mac, LAN IP on a phone).
export function createSession(
  input: CreateSessionInput,
  baseUrl: string = HOST_BASE_URL
): CreateSessionResult {
  const now = new Date();
  const ttl = input.ttl ?? DEFAULT_LINK_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl).toISOString();
  const createdAt = now.toISOString();

  let reportId = input.reportId;
  if (!reportId) reportId = newReportId();
  if (getReport(reportId)) reportId = newReportId();

  insertReport({ reportId, createdAt, expiresAt });
  // Seed each party with whatever the call captured (partyA falls back to the
  // legacy `causer` alias). Party B is often just a phone number so we can text
  // them their link — that's fine, it prefills their form.
  const a = input.partyA ?? input.causer;
  setParty(reportId, "A", { vehicle: a?.vehicle ?? {}, driver: a?.driver ?? {} });
  if (input.partyB)
    setParty(reportId, "B", {
      vehicle: input.partyB.vehicle ?? {},
      driver: input.partyB.driver ?? {},
    });
  audit(reportId, "session_created", createdAt);

  const slugA = newSlug();
  const slugB = newSlug();
  insertLink({ slug: slugA, reportId, party: "A", prefill: "{}", usedAt: null, expiresAt });
  insertLink({ slug: slugB, reportId, party: "B", prefill: "{}", usedAt: null, expiresAt });

  return {
    reportId,
    partyA: { slug: slugA, url: `${baseUrl}/r/${slugA}` },
    partyB: { slug: slugB, url: `${baseUrl}/r/${slugB}` },
    expiresAt,
  };
}
