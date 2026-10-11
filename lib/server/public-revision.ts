import type { ManagedTransaction } from "neo4j-driver";
import { ApiError } from "./http";
import { dataReleaseLabels } from "../i18n/data-release";

export async function readPublicRevision(tx: ManagedTransaction, expected: string | null = null) {
  const rows = (await tx.run("MATCH (s:DatasetState {id:'public-kg'}) RETURN s.release AS release, s.revision AS revision")).records;
  if (rows.length !== 1 || !rows[0].get("release")) throw new ApiError(503, "SERVICE_UNAVAILABLE", dataReleaseLabels().preparing);
  // step4で投入済みのDBも、書き換えずに読み取れる。
  const revision: string = rows[0].get("revision") ?? `legacy:${rows[0].get("release")}`;
  if (expected !== null && expected !== revision) throw new ApiError(409, "DATASET_CHANGED", dataReleaseLabels().changed);
  return revision;
}
