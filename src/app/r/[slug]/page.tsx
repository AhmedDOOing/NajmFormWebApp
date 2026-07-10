import { cookies } from "next/headers";
import { getLink, getReport } from "@/lib/db";
import type { AccidentData, IntakeData, PartyData } from "@/lib/types";
import { langCookieName, parseLocale } from "@/lib/locale";
import PartyFlow from "@/components/PartyFlow";
import RecoveryPage from "@/components/RecoveryPage";

export const dynamic = "force-dynamic";

// GET /r/:slug — one opaque token = a Party A or Party B link. Resolve
// server-side and route to the (identical) per-party flow. No PII in the URL;
// each party's details are SSR'd only to the holder of the link.
export default function ShortLinkPage({ params }: { params: { slug: string } }) {
  const link = getLink(params.slug);
  if (!link || (link.party !== "A" && link.party !== "B")) {
    return <RecoveryPage reason="not_found" />;
  }
  if (new Date(link.expiresAt).getTime() < Date.now())
    return <RecoveryPage reason="expired" reportId={link.reportId} />;

  const report = getReport(link.reportId);
  if (!report || report.status === "expired")
    return <RecoveryPage reason="expired" reportId={link.reportId} />;

  const party = link.party;
  const partyA = JSON.parse(report.partyA || "{}") as PartyData;
  const partyB = JSON.parse(report.partyB || "{}") as PartyData;
  const accident = JSON.parse(report.accident || "{}") as AccidentData;
  const self = party === "A" ? partyA : partyB;
  const other = party === "A" ? partyB : partyA;
  const intakeRaw = JSON.parse(report.intake || "{}") as Partial<IntakeData>;
  const intake: IntakeData = { source: intakeRaw.source ?? "manual", ...intakeRaw };
  const saved = parseLocale(cookies().get(langCookieName(report.reportId, party))?.value);

  return (
    <PartyFlow
      reportId={report.reportId}
      slug={link.slug}
      party={party}
      self={self}
      otherParty={other}
      accident={accident}
      intake={intake}
      initialLang={saved}
    />
  );
}
