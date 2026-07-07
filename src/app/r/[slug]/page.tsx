import { cookies } from "next/headers";
import { getLink, getLinkForParty, getReport, getSubmissions } from "@/lib/db";
import type { Party, Prefill } from "@/lib/types";
import { langCookieName, parseLocale } from "@/lib/locale";
import ReportSession from "@/components/ReportSession";
import RecoveryPage from "@/components/RecoveryPage";

export const dynamic = "force-dynamic";

// GET /r/:slug — the single entry link. Resolves the OPAQUE slug to its report,
// then SSR-loads BOTH parties' pre-fill for this one trusted device (never a
// public API — no PII leak, no PII in the URL). The driver picks their party.
export default function ShortLinkPage({ params }: { params: { slug: string } }) {
  const aLink = getLinkForPartyBySlug(params.slug, "A");
  const bLink = getLinkForPartyBySlug(params.slug, "B");

  // Missing / unknown slug -> recovery page, not a raw 404.
  if (!aLink || !bLink) {
    return <RecoveryPage reason="not_found" />;
  }

  // Expired link -> recovery page.
  if (new Date(aLink.expiresAt).getTime() < Date.now()) {
    return <RecoveryPage reason="expired" reportId={aLink.reportId} />;
  }

  const report = getReport(aLink.reportId);
  if (!report || report.status === "expired") {
    return <RecoveryPage reason="expired" reportId={aLink.reportId} />;
  }

  const doneParties = getSubmissions(aLink.reportId).map((s) => s.party) as Party[];
  const saved = parseLocale(
    cookies().get(langCookieName(aLink.reportId, "A"))?.value
  );

  return (
    <ReportSession
      reportId={aLink.reportId}
      aSlug={aLink.slug}
      aPrefill={JSON.parse(aLink.prefill) as Prefill}
      bSlug={bLink.slug}
      bPrefill={JSON.parse(bLink.prefill) as Prefill}
      initialFlags={JSON.parse(report.flags) as string[]}
      initialLang={saved}
      doneParties={doneParties}
    />
  );
}

// Resolve the opened slug to its report, then fetch the given party's link on
// that report (so one entry link exposes both parties for the single device).
function getLinkForPartyBySlug(slug: string, party: Party) {
  const entry = getLink(slug);
  if (!entry) return undefined;
  return getLinkForParty(entry.reportId, party);
}
