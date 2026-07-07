import type { Locale } from "./types";

// Per-report+party language cookie. Read server-side in the slug resolver (so
// the gate is skipped on refresh / resumed link) and written client-side when a
// language is chosen or toggled. Carries a locale only — never any PII.
export function langCookieName(reportId: string, party: string): string {
  return `najm_lang_${reportId}_${party}`;
}

export function parseLocale(v: string | undefined | null): Locale | null {
  return v === "ar" || v === "en" ? v : null;
}

// Client-only: persist the chosen locale for this report+party.
export function setLangCookie(reportId: string, party: string, locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${langCookieName(reportId, party)}=${locale}; path=/; max-age=86400; samesite=lax`;
}
