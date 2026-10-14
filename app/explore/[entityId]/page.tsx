import Explorer from "../../../components/Explorer";
import { datasetMode } from "../../../lib/domain/dataset";
import { getEntity } from "../../../lib/server/graph";
import { z } from "zod";
import { explorationMetadata, publicationPolicy } from "../../../lib/server/publication";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { entityId } = await params;
  let title = "Plunode — 知識のつながりを探索する", description = "現在のKnowledge Graphから関係を辿り、資料を確認できます。", exists = false;
  if (z.uuidv4().safeParse(entityId).success) {
    try { const { entity } = await getEntity(entityId); title = `${entity.name}の関係を探索する — Plunode`; description = entity.description || description; exists = true; } catch { /* Client shows the read failure with retry. */ }
  }
  return explorationMetadata(`/explore/${entityId}`, Object.keys(await searchParams).length > 0, title, description, exists);
}
export default async function Page({ params }: { params: Promise<{ entityId: string }> }) {
  return <Explorer services={await publicationPolicy()} dataset={datasetMode(process.env.GRAPH_DATASET)} initialRoot={(await params).entityId} />;
}
