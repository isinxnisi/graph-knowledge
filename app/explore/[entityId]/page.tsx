import Explorer from "../../../components/Explorer";
import { datasetMode } from "../../../lib/domain/dataset";
import { getEntity } from "../../../lib/server/graph";
import { z } from "zod";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  let title = "関係性を探索する";
  if (z.uuidv4().safeParse(entityId).success) {
    try { title = `${(await getEntity(entityId)).entity.name} — 関係性を探索する`; } catch { /* Client shows the read failure with retry. */ }
  }
  const description = "現在のKnowledge Graphから、URLに記録した探索条件・枝・配置を復元します。";
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description } };
}
export default async function Page({ params }: { params: Promise<{ entityId: string }> }) {
  return <Explorer dataset={datasetMode(process.env.GRAPH_DATASET)} initialRoot={(await params).entityId} />;
}
