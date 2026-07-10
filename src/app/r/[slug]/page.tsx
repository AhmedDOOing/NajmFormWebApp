import { cookies } from "next/headers";
import { getAffectedByAckSlug, getLink, getReport } from "@/lib/db";
import type {
  AccidentData,
  CauserData,
  IntakeData,
  PropertyItem,
  VehicleInfo,
} from "@/lib/types";
import { langCookieName, parseLocale } from "@/lib/locale";
import CauserFlow from "@/components/CauserFlow";
import AffectedAck from "@/components/AffectedAck";
import RecoveryPage from "@/components/RecoveryPage";

export const dynamic = "force-dynamic";

// GET /r/:slug — one opaque token. It's either the CAUSER's filing link or an
// AFFECTED party's acknowledgment link; resolve server-side and route. No PII
// in the URL; details are SSR'd only to the holder of the link.
export default function ShortLinkPage({ params }: { params: { slug: string } }) {
  // 1) Causer filing link?
  const causerLink = getLink(params.slug);
  if (causerLink && causerLink.party === "A") {
    if (new Date(causerLink.expiresAt).getTime() < Date.now())
      return <RecoveryPage reason="expired" reportId={causerLink.reportId} />;
    const report = getReport(causerLink.reportId);
    if (!report || report.status === "expired")
      return <RecoveryPage reason="expired" reportId={causerLink.reportId} />;
    const saved = parseLocale(cookies().get(langCookieName(report.reportId, "A"))?.value);
    const intake = JSON.parse(report.intake || "{}") as Partial<IntakeData>;
    return (
      <CauserFlow
        reportId={report.reportId}
        slug={causerLink.slug}
        causer={JSON.parse(report.causer || "{}") as CauserData}
        intake={{ source: intake.source ?? "manual", ...intake }}
        initialLang={saved}
      />
    );
  }

  // 2) Affected acknowledgment link?
  const aff = getAffectedByAckSlug(params.slug);
  if (aff) {
    const report = getReport(aff.reportId);
    if (!report) return <RecoveryPage reason="not_found" />;
    const causer = JSON.parse(report.causer || "{}") as CauserData;
    const accident = JSON.parse(report.accident || "{}") as AccidentData;
    const properties = JSON.parse(report.properties || "[]") as PropertyItem[];
    const saved = parseLocale(cookies().get(langCookieName(report.reportId, "B"))?.value);
    return (
      <AffectedAck
        ackSlug={aff.ackSlug}
        reportId={report.reportId}
        initialLang={saved}
        ackStatus={aff.ack}
        summary={{
          causerVehicle: (causer.vehicle ?? {}) as VehicleInfo,
          affectedVehicle: JSON.parse(aff.vehicle) as VehicleInfo,
          accident: {
            locationText: accident.locationText,
            dateTime: accident.dateTime,
            area: accident.area,
          },
          properties,
        }}
      />
    );
  }

  // 3) Unknown / expired.
  return <RecoveryPage reason="not_found" />;
}
