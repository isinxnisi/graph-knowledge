import Explorer from "../components/Explorer";
import { datasetMode } from "../lib/domain/dataset";
import { explorationMetadata, publicationPolicy } from "../lib/server/publication";

export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return explorationMetadata("/", Object.keys(await searchParams).length > 0); }
export default async function Page() { return <Explorer services={await publicationPolicy()} key={datasetMode(process.env.GRAPH_DATASET)} dataset={datasetMode(process.env.GRAPH_DATASET)} />; }
