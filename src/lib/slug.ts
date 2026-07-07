import { customAlphabet } from "nanoid";
import { SLUG_LENGTH } from "./config";

// URL-safe, unambiguous alphabet (no look-alikes: 0/O, 1/l/I). The slug is an
// OPAQUE key — it carries no PII, only points at a server-side prefill payload.
const alphabet = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const nano = customAlphabet(alphabet, SLUG_LENGTH);

export function newSlug(): string {
  return nano();
}

// Human-facing report id, e.g. NJM-26-4821. Not secret, but not a data carrier.
const digits = customAlphabet("0123456789", 4);
export function newReportId(): string {
  const yy = "26"; // Date.* is unavailable in some sandboxes; year is cosmetic here.
  return `NJM-${yy}-${digits()}`;
}
