import { notFound } from "next/navigation";
import TemporalPatternLab from "../../../components/TemporalPatternLab";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  if (
    process.env.THEME_WORKBENCH_ENABLED !== "1" ||
    process.env.THEME_ORIGIN !== "http://localhost:3276"
  )
    notFound();
  const query = await searchParams;
  return <TemporalPatternLab caseId={query.case ?? "precision-mixed"} />;
}
