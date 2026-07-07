import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default function DashboardPage({
  params,
}: {
  params: { reportId: string };
}) {
  return <DashboardClient reportId={params.reportId} />;
}
