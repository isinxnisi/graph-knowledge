import MemberCapsules from "../../../components/MemberCapsules";
import { datasetMode } from "../../../lib/domain/dataset";
export const dynamic = "force-dynamic";
export const metadata = { title: "アカウント | Plunode", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ import?: string | string[] }> }) {
  const params = await searchParams;
  return <MemberCapsules dataset={datasetMode(process.env.GRAPH_DATASET)} initialImport={typeof params.import === "string" ? params.import : ""} />;
}
