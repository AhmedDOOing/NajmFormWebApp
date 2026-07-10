import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  AffectedRow,
  LinkRow,
  Party,
  ReportRow,
  ReportStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Local dev persistence. For prod, swap:
//   - report + link + affected -> Postgres (durable, transactional)
//   - feed_event / sms_message -> Postgres or a queue-backed store
// The interface below is intentionally narrow so those swaps are localized.
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, "najm.db");

// Reuse a single connection across HMR reloads in dev.
const g = globalThis as unknown as { __najmDb?: Database.Database };
export const db: Database.Database = g.__najmDb ?? new Database(dbPath);
g.__najmDb = db;

// Retry (rather than throw SQLITE_BUSY) when another connection holds the write
// lock briefly — matters when several processes open the dev DB file at once
// (e.g. next build page-data workers). Must be set BEFORE journal_mode, which
// itself needs a write lock.
db.pragma("busy_timeout = 5000");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS report (
    reportId   TEXT PRIMARY KEY,
    status     TEXT NOT NULL DEFAULT 'open',
    createdAt  TEXT NOT NULL,
    expiresAt  TEXT NOT NULL,
    flags      TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS link (
    slug       TEXT PRIMARY KEY,
    reportId   TEXT NOT NULL REFERENCES report(reportId),
    party      TEXT NOT NULL,
    prefill    TEXT NOT NULL DEFAULT '{}',
    usedAt     TEXT,
    expiresAt  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_link_report ON link(reportId);

  -- Append-only audit log: every meaningful step, timestamped.
  CREATE TABLE IF NOT EXISTS audit (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    reportId  TEXT NOT NULL,
    party     TEXT,
    event     TEXT NOT NULL,
    detail    TEXT,
    at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_report ON audit(reportId);

  -- eTraffic model: affected parties added by the causer via registry lookup.
  -- Read-only registry data + an opaque acknowledgment link + accept/reject.
  CREATE TABLE IF NOT EXISTS affected (
    reportId  TEXT NOT NULL REFERENCES report(reportId),
    idx       INTEGER NOT NULL,
    vehicle   TEXT NOT NULL,
    driver    TEXT NOT NULL,
    ackSlug   TEXT NOT NULL UNIQUE,
    ack       TEXT NOT NULL DEFAULT 'pending',
    ackAt     TEXT,
    lookupFailed INTEGER NOT NULL DEFAULT 0,
    addedAt   TEXT NOT NULL,
    PRIMARY KEY (reportId, idx)
  );
  CREATE INDEX IF NOT EXISTS idx_affected_report ON affected(reportId);

  -- Live demo feed: every incoming webhook + every action the server took.
  -- Append-only; the /phone simulator polls this with an id cursor.
  CREATE TABLE IF NOT EXISTS feed_event (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,             -- 'webhook' | 'action'
    callId     TEXT,                      -- Hamsa callId (webhook rows)
    eventType  TEXT,                      -- call.started|call.ended|...|link_minted|report_filed
    reportId   TEXT,
    summary    TEXT NOT NULL,             -- human one-liner for the feed panel
    payload    TEXT NOT NULL DEFAULT '{}',-- raw webhook JSON / action detail
    at         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feed_call ON feed_event(callId);

  -- SMS outbox (real Twilio send or simulated). The /phone page groups these
  -- into phone frames by toNumber.
  CREATE TABLE IF NOT EXISTS sms_message (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reportId    TEXT,
    toParty     TEXT NOT NULL,            -- 'causer' | 'affected'
    toNumber    TEXT NOT NULL,
    body        TEXT NOT NULL,
    linkUrl     TEXT,
    provider    TEXT NOT NULL,            -- 'simulated' | 'twilio'
    providerSid TEXT,
    status      TEXT NOT NULL,            -- 'simulated' | 'queued' | 'sent' | 'failed'
    error       TEXT,
    at          TEXT NOT NULL
  );
`);

// --- lightweight migrations (add columns to pre-existing DBs) --------------
{
  const cols = db.prepare(`PRAGMA table_info(report)`).all() as { name: string }[];
  const has = (n: string) => cols.some((c) => c.name === n);
  // eTraffic model: the causer fills everything; content lives as JSON on the row.
  if (!has("causer"))
    db.exec(`ALTER TABLE report ADD COLUMN causer TEXT NOT NULL DEFAULT '{}'`);
  if (!has("accident"))
    db.exec(`ALTER TABLE report ADD COLUMN accident TEXT NOT NULL DEFAULT '{}'`);
  if (!has("properties"))
    db.exec(`ALTER TABLE report ADD COLUMN properties TEXT NOT NULL DEFAULT '[]'`);
  // AI photo-analysis result (assistive; stored in the audit trail on the row).
  if (!has("photoAnalysis"))
    db.exec(`ALTER TABLE report ADD COLUMN photoAnalysis TEXT NOT NULL DEFAULT ''`);
  // How the report was minted (hamsa webhook vs manual/seed) + call-captured
  // extras beyond the causer's identity (injuries, other party's mobile, hints).
  if (!has("intake"))
    db.exec(`ALTER TABLE report ADD COLUMN intake TEXT NOT NULL DEFAULT '{}'`);
}

// --- report ---------------------------------------------------------------

export function insertReport(r: {
  reportId: string;
  createdAt: string;
  expiresAt: string;
}): void {
  db.prepare(
    `INSERT INTO report (reportId, status, createdAt, expiresAt, flags)
     VALUES (@reportId, 'open', @createdAt, @expiresAt, '[]')`
  ).run(r);
}

export function getReport(reportId: string): ReportRow | undefined {
  return db.prepare(`SELECT * FROM report WHERE reportId = ?`).get(reportId) as
    | ReportRow
    | undefined;
}

export function setReportStatus(reportId: string, status: ReportStatus): void {
  db.prepare(`UPDATE report SET status = ? WHERE reportId = ?`).run(status, reportId);
}

export function setReportFlags(reportId: string, flags: string[]): void {
  db.prepare(`UPDATE report SET flags = ? WHERE reportId = ?`).run(
    JSON.stringify(flags),
    reportId
  );
}

// --- eTraffic report content (causer fills everything) --------------------

export function setCauser(reportId: string, causer: object): void {
  db.prepare(`UPDATE report SET causer = ? WHERE reportId = ?`).run(
    JSON.stringify(causer),
    reportId
  );
}
export function setAccident(reportId: string, accident: object): void {
  db.prepare(`UPDATE report SET accident = ? WHERE reportId = ?`).run(
    JSON.stringify(accident),
    reportId
  );
}
export function setProperties(reportId: string, properties: object[]): void {
  db.prepare(`UPDATE report SET properties = ? WHERE reportId = ?`).run(
    JSON.stringify(properties),
    reportId
  );
}
export function setPhotoAnalysis(reportId: string, analysis: object): void {
  db.prepare(`UPDATE report SET photoAnalysis = ? WHERE reportId = ?`).run(
    JSON.stringify(analysis),
    reportId
  );
}
export function setIntake(reportId: string, intake: object): void {
  db.prepare(`UPDATE report SET intake = ? WHERE reportId = ?`).run(
    JSON.stringify(intake),
    reportId
  );
}

// --- affected parties (added by lookup; acknowledge via opaque slug) -------

export function insertAffected(a: {
  reportId: string;
  idx: number;
  vehicle: object;
  driver: object;
  ackSlug: string;
  lookupFailed: boolean;
  addedAt: string;
}): void {
  db.prepare(
    `INSERT INTO affected (reportId, idx, vehicle, driver, ackSlug, ack, lookupFailed, addedAt)
     VALUES (@reportId, @idx, @vehicle, @driver, @ackSlug, 'pending', @lookupFailed, @addedAt)`
  ).run({
    reportId: a.reportId,
    idx: a.idx,
    vehicle: JSON.stringify(a.vehicle),
    driver: JSON.stringify(a.driver),
    ackSlug: a.ackSlug,
    lookupFailed: a.lookupFailed ? 1 : 0,
    addedAt: a.addedAt,
  });
}

export function getAffected(reportId: string): AffectedRow[] {
  return db
    .prepare(`SELECT * FROM affected WHERE reportId = ? ORDER BY idx`)
    .all(reportId) as AffectedRow[];
}

export function getAffectedByAckSlug(ackSlug: string): AffectedRow | undefined {
  return db.prepare(`SELECT * FROM affected WHERE ackSlug = ?`).get(ackSlug) as
    | AffectedRow
    | undefined;
}

export function setAck(
  ackSlug: string,
  ack: "accepted" | "rejected",
  at: string
): void {
  db.prepare(`UPDATE affected SET ack = ?, ackAt = ? WHERE ackSlug = ?`).run(
    ack,
    at,
    ackSlug
  );
}

// --- link (slug -> report + party) ------------------------------------------

export function insertLink(l: LinkRow): void {
  db.prepare(
    `INSERT INTO link (slug, reportId, party, prefill, usedAt, expiresAt)
     VALUES (@slug, @reportId, @party, @prefill, @usedAt, @expiresAt)`
  ).run(l);
}

export function getLink(slug: string): LinkRow | undefined {
  return db.prepare(`SELECT * FROM link WHERE slug = ?`).get(slug) as
    | LinkRow
    | undefined;
}

export function getLinkForParty(reportId: string, party: Party): LinkRow | undefined {
  return db
    .prepare(`SELECT * FROM link WHERE reportId = ? AND party = ?`)
    .get(reportId, party) as LinkRow | undefined;
}

export function markLinkUsed(slug: string, at: string): void {
  db.prepare(`UPDATE link SET usedAt = ? WHERE slug = ? AND usedAt IS NULL`).run(
    at,
    slug
  );
}

// --- feed (live webhook/action stream for the /phone simulator) ------------

export interface FeedEventRow {
  id: number;
  kind: "webhook" | "action";
  callId: string | null;
  eventType: string | null;
  reportId: string | null;
  summary: string;
  payload: string; // JSON
  at: string;
}

export function insertFeedEvent(e: {
  kind: "webhook" | "action";
  callId?: string;
  eventType?: string;
  reportId?: string;
  summary: string;
  payload?: object;
  at: string;
}): number {
  const res = db
    .prepare(
      `INSERT INTO feed_event (kind, callId, eventType, reportId, summary, payload, at)
       VALUES (@kind, @callId, @eventType, @reportId, @summary, @payload, @at)`
    )
    .run({
      kind: e.kind,
      callId: e.callId ?? null,
      eventType: e.eventType ?? null,
      reportId: e.reportId ?? null,
      summary: e.summary,
      payload: JSON.stringify(e.payload ?? {}),
      at: e.at,
    });
  return Number(res.lastInsertRowid);
}

export function getFeedSince(sinceId: number): FeedEventRow[] {
  return db
    .prepare(`SELECT * FROM feed_event WHERE id > ? ORDER BY id`)
    .all(sinceId) as FeedEventRow[];
}

// Idempotency: has this Hamsa call already minted a report? Returns the
// earlier action row (its reportId) if so.
export function findMintedByCallId(callId: string): FeedEventRow | undefined {
  return db
    .prepare(
      `SELECT * FROM feed_event
       WHERE callId = ? AND kind = 'action' AND eventType = 'link_minted'
       ORDER BY id LIMIT 1`
    )
    .get(callId) as FeedEventRow | undefined;
}

// --- sms outbox -------------------------------------------------------------

export interface SmsRow {
  id: number;
  reportId: string | null;
  toParty: "causer" | "affected";
  toNumber: string;
  body: string;
  linkUrl: string | null;
  provider: "simulated" | "twilio";
  providerSid: string | null;
  status: "simulated" | "queued" | "sent" | "failed";
  error: string | null;
  at: string;
}

export function insertSms(s: {
  reportId?: string;
  toParty: "causer" | "affected";
  toNumber: string;
  body: string;
  linkUrl?: string;
  provider: "simulated" | "twilio";
  providerSid?: string;
  status: "simulated" | "queued" | "sent" | "failed";
  error?: string;
  at: string;
}): number {
  const res = db
    .prepare(
      `INSERT INTO sms_message (reportId, toParty, toNumber, body, linkUrl, provider, providerSid, status, error, at)
       VALUES (@reportId, @toParty, @toNumber, @body, @linkUrl, @provider, @providerSid, @status, @error, @at)`
    )
    .run({
      reportId: s.reportId ?? null,
      toParty: s.toParty,
      toNumber: s.toNumber,
      body: s.body,
      linkUrl: s.linkUrl ?? null,
      provider: s.provider,
      providerSid: s.providerSid ?? null,
      status: s.status,
      error: s.error ?? null,
      at: s.at,
    });
  return Number(res.lastInsertRowid);
}

export function getSmsSince(sinceId: number): SmsRow[] {
  return db
    .prepare(`SELECT * FROM sms_message WHERE id > ? ORDER BY id`)
    .all(sinceId) as SmsRow[];
}

// --- audit ----------------------------------------------------------------

export function audit(
  reportId: string,
  event: string,
  at: string,
  opts: { party?: Party; detail?: string } = {}
): void {
  db.prepare(
    `INSERT INTO audit (reportId, party, event, detail, at) VALUES (?, ?, ?, ?, ?)`
  ).run(reportId, opts.party ?? null, event, opts.detail ?? null, at);
}

export function getAudit(reportId: string) {
  return db
    .prepare(`SELECT party, event, detail, at FROM audit WHERE reportId = ? ORDER BY id`)
    .all(reportId);
}
