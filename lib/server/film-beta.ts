import { assertDatasetTarget } from "../domain/dataset";
export const FILM_BETA_REVISION = "film-beta-issue43-unaccepted-v1";
export function filmBetaEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.GRAPH_FILM_BETA === undefined || env.GRAPH_FILM_BETA === "0") return false;
  if (env.GRAPH_FILM_BETA !== "1") throw new Error("Invalid GRAPH_FILM_BETA");
  assertDatasetTarget("public-kg", env.NEO4J_URI ?? "", env.GRAPH_DEPLOYMENT, env.GRAPH_FILM_BETA);
  if (env.GRAPH_DATASET !== "public-kg") throw new Error("Film beta requires public-kg read protocol");
  return true;
}
