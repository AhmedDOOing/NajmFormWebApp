import { DEFAULT_LINK_TTL_MS, HOST_BASE_URL } from "./config";
import {
  audit,
  getReport,
  insertLink,
  insertReport,
  setCauser,
  setIntake,
} from "./db";
import { newReportId, newSlug } from "./slug";
import type { DriverInfo, IntakeData, VehicleInfo } from "./types";

export interface CreateSessionInput {
  reportId?: string;
  ttl?: number; // ms
  // The causer's registered details (from the voice agent / their identity).
  causer?: { vehicle?: Partial<VehicleInfo>; driver?: Partial<DriverInfo> };
  // How this report was minted + call-captured extras. Defaults to manual
  // (seed / demo landing) — the Hamsa webhook passes source:"hamsa".
  intake?: IntakeData;
}

export interface CreateSessionResult {
  reportId: string;
  causer: { url: string; slug: string };
  expiresAt: string;
}

// eTraffic model: mint one report + ONE opaque link for the causer (the only
// filer). Affected parties are added later by lookup and get their own ack
// links. The slug carries NO PII — the causer's details live server-side.
export function createSession(input: CreateSessionInput): CreateSessionResult {
  const now = new Date();
  const ttl = input.ttl ?? DEFAULT_LINK_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl).toISOString();
  const createdAt = now.toISOString();

  let reportId = input.reportId;
  if (!reportId) reportId = newReportId();
  if (getReport(reportId)) reportId = newReportId();

  insertReport({ reportId, createdAt, expiresAt });
  setCauser(reportId, {
    vehicle: input.causer?.vehicle ?? {},
    driver: input.causer?.driver ?? {},
  });
  setIntake(reportId, input.intake ?? { source: "manual" });
  audit(reportId, "session_created", createdAt, {
    detail: `source:${input.intake?.source ?? "manual"}`,
  });

  const slug = newSlug();
  insertLink({
    slug,
    reportId,
    party: "A", // the causer's filing link
    prefill: "{}",
    usedAt: null,
    expiresAt,
  });

  return {
    reportId,
    causer: { slug, url: `${HOST_BASE_URL}/r/${slug}` },
    expiresAt,
  };
}
