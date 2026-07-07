import { cookies } from "next/headers";
import { getLink, getReport, getSubmissions } from "@/lib/db";
import type { Prefill } from "@/lib/types";
import { langCookieName, parseLocale } from "@/lib/locale";
import ReportEntry from "@/components/ReportEntry";
import RecoveryPage from "@/components/RecoveryPage";

export const dynamic = "force-dynamic";

// GET /r/:slug — the short link. Resolves the OPAQUE slug server-side to
// { reportId, party, prefill } and SSR-renders the form with values injected.
// No PII ever travels in the URL; the slug is only a key.
export default function ShortLinkPage({ params }: { params: { slug: string } }) {
  const link = getLink(params.slug);

  // Missing / unknown slug -> recovery page, not a raw 404.
  if (!link) {
    return <RecoveryPage reason="not_found" />;
  }

  // Expired link -> recovery page that offers a fresh link (LINK_EXPIRED).
  if (new Date(link.expiresAt).getTime() < Date.now()) {
    return <RecoveryPage reason="expired" reportId={link.reportId} />;
  }

  const report = getReport(link.reportId);
  if (!report || report.status === "expired") {
    return <RecoveryPage reason="expired" reportId={link.reportId} />;
  }

  const prefill = JSON.parse(link.prefill) as Prefill;

  // Dropped-call resilience: reopening the same link restores the session.
  // If this party already submitted, we render read-only "submitted" state.
  const alreadySubmitted = getSubmissions(link.reportId).some(
    (s) => s.party === link.party
  );

  // Language chosen before? -> skip the gate (refresh / resumed link).
  const saved = parseLocale(
    cookies().get(langCookieName(link.reportId, link.party))?.value
  );

  return (
    <ReportEntry
      reportId={link.reportId}
      party={link.party}
      slug={link.slug}
      prefill={prefill}
      initialFlags={JSON.parse(report.flags) as string[]}
      alreadySubmitted={alreadySubmitted}
      initialLang={saved}
    />
  );
}
