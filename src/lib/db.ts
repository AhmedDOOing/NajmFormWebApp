import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  LinkRow,
  Party,
  PartyLocation,
  Phase,
  ReportRow,
  ReportStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Local dev persistence. For prod, swap:
//   - report + link  -> Postgres (durable, transactional)
//   - party_session / presence -> Redis (fast, pub/sub across server instances)
// The interface below is intentionally narrow so those swaps are localized.
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, "najm.db");

// Reuse a single connection across HMR reloads in dev.
const g = globalThis as unknown as { __najmDb?: Database.Database };
export const db: Database.Database = g.__najmDb ?? new Database(dbPath);
g.__najmDb = db;

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
// Retry (rather than throw SQLITE_BUSY) when another connection holds the write
// lock briefly — matters if more than one process opens the dev DB file.
db.pragma("busy_timeout = 5000");

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

  -- Answers each party submitted (audit trail; one row per party per report).
  CREATE TABLE IF NOT EXISTS submission (
    reportId    TEXT NOT NULL REFERENCES report(reportId),
    party       TEXT NOT NULL,
    answers     TEXT NOT NULL,
    flags       TEXT NOT NULL DEFAULT '[]',
    submittedAt TEXT NOT NULL,
    PRIMARY KEY (reportId, party)
  );

  -- Discrete, timestamped consent record per party (brief §9).
  CREATE TABLE IF NOT EXISTS consent (
    reportId  TEXT NOT NULL REFERENCES report(reportId),
    party     TEXT NOT NULL,
    grantedAt TEXT NOT NULL,
    PRIMARY KEY (reportId, party)
  );

  -- Location each party shared (pre-submit, live). One row per party.
  CREATE TABLE IF NOT EXISTS party_location (
    reportId  TEXT NOT NULL REFERENCES report(reportId),
    party     TEXT NOT NULL,
    lat       REAL,
    lng       REAL,
    accuracy  REAL,
    label     TEXT,
    source    TEXT NOT NULL,
    at        TEXT NOT NULL,
    PRIMARY KEY (reportId, party)
  );

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
`);

// --- lightweight migrations (add columns to pre-existing DBs) --------------
// Single-device handover state lives on the report: `phase` drives the zone
// edit-locks (partyA -> handover -> partyB -> complete); `verifyAttempts`
// tracks Party-B identity retries.
{
  const cols = db.prepare(`PRAGMA table_info(report)`).all() as { name: string }[];
  const has = (n: string) => cols.some((c) => c.name === n);
  if (!has("phase"))
    db.exec(`ALTER TABLE report ADD COLUMN phase TEXT NOT NULL DEFAULT 'partyA'`);
  if (!has("verifyAttempts"))
    db.exec(`ALTER TABLE report ADD COLUMN verifyAttempts INTEGER NOT NULL DEFAULT 0`);
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

export function setPhase(reportId: string, phase: Phase): void {
  db.prepare(`UPDATE report SET phase = ? WHERE reportId = ?`).run(phase, reportId);
}

// Increments and returns the new Party-B verification attempt count.
export function incVerifyAttempts(reportId: string): number {
  db.prepare(
    `UPDATE report SET verifyAttempts = verifyAttempts + 1 WHERE reportId = ?`
  ).run(reportId);
  const r = db
    .prepare(`SELECT verifyAttempts FROM report WHERE reportId = ?`)
    .get(reportId) as { verifyAttempts: number };
  return r.verifyAttempts;
}

export function setReportFlags(reportId: string, flags: string[]): void {
  db.prepare(`UPDATE report SET flags = ? WHERE reportId = ?`).run(
    JSON.stringify(flags),
    reportId
  );
}

// --- link (slug -> predefined values) -------------------------------------

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

// --- submission -----------------------------------------------------------

export function upsertSubmission(s: {
  reportId: string;
  party: Party;
  answers: object;
  flags: string[];
  submittedAt: string;
}): void {
  db.prepare(
    `INSERT INTO submission (reportId, party, answers, flags, submittedAt)
     VALUES (@reportId, @party, @answers, @flags, @submittedAt)
     ON CONFLICT(reportId, party) DO UPDATE SET
       answers = excluded.answers,
       flags = excluded.flags,
       submittedAt = excluded.submittedAt`
  ).run({
    reportId: s.reportId,
    party: s.party,
    answers: JSON.stringify(s.answers),
    flags: JSON.stringify(s.flags),
    submittedAt: s.submittedAt,
  });
}

export function getSubmissions(
  reportId: string
): { party: Party; flags: string[]; submittedAt: string }[] {
  const rows = db
    .prepare(`SELECT party, flags, submittedAt FROM submission WHERE reportId = ?`)
    .all(reportId) as { party: Party; flags: string; submittedAt: string }[];
  return rows.map((r) => ({
    party: r.party,
    flags: JSON.parse(r.flags) as string[],
    submittedAt: r.submittedAt,
  }));
}

// --- party_location -------------------------------------------------------

export function upsertLocation(l: {
  reportId: string;
  party: Party;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  label: string | null;
  source: "gps" | "manual";
  at: string;
}): void {
  db.prepare(
    `INSERT INTO party_location (reportId, party, lat, lng, accuracy, label, source, at)
     VALUES (@reportId, @party, @lat, @lng, @accuracy, @label, @source, @at)
     ON CONFLICT(reportId, party) DO UPDATE SET
       lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
       label = excluded.label, source = excluded.source, at = excluded.at`
  ).run(l);
}

export function getLocations(reportId: string): PartyLocation[] {
  return db
    .prepare(
      `SELECT party, lat, lng, accuracy, label, source, at
       FROM party_location WHERE reportId = ?`
    )
    .all(reportId) as PartyLocation[];
}

// --- consent --------------------------------------------------------------

export function recordConsent(reportId: string, party: Party, at: string): void {
  db.prepare(
    `INSERT INTO consent (reportId, party, grantedAt) VALUES (?, ?, ?)
     ON CONFLICT(reportId, party) DO NOTHING`
  ).run(reportId, party, at);
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
