export const DATASET_MODES = ["demo", "pilot-urasawa-v1", "pilot-urasawa-v2", "pilot-science-v1", "pilot-science-v2", "pilot-event-v1", "public-kg"] as const;
export type DatasetMode = typeof DATASET_MODES[number];
export function datasetMode(value: string | undefined): DatasetMode {
  if (value === undefined || value === "demo") return "demo";
  if (DATASET_MODES.includes(value as DatasetMode)) return value as DatasetMode;
  throw new Error("Unknown GRAPH_DATASET");
}
export function assertDatasetTarget(mode: DatasetMode, uri: string, deployment = process.env.GRAPH_DEPLOYMENT, filmBeta = process.env.GRAPH_FILM_BETA) {
  const target = new URL(uri);
  if (filmBeta !== undefined && filmBeta !== "0") {
    if (filmBeta !== "1" || deployment !== undefined || mode !== "public-kg" || !["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "7696") throw new Error("Film beta requires its isolated loopback database on 7696, outside production");
    return;
  }
  if (target.port === "7696") throw new Error("Film beta database requires GRAPH_FILM_BETA=1");
  if (deployment !== undefined && deployment !== "production") throw new Error("Unknown GRAPH_DEPLOYMENT");
  if (deployment === "production") {
    // 本番の名前解決は専用Compose network内だけ。凍結版・任意の外部DBは許可しない。
    if (mode !== "public-kg" || uri !== "bolt://graph-neo4j:7687") throw new Error("Production requires public-kg and its dedicated internal database");
    return;
  }
  if (target.hostname === "graph-neo4j") throw new Error("Production database requires GRAPH_DEPLOYMENT=production");
  if (mode === "public-kg" && (!["127.0.0.1", "localhost"].includes(target.hostname) || !["7694", "7695"].includes(target.port))) throw new Error("Public KG local development requires dedicated port 7694 or isolated test port 7695");
  if (mode !== "public-kg" && ["7694", "7695"].includes(target.port)) throw new Error("Frozen datasets cannot use a public KG database");
  if (mode === "pilot-event-v1" && (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "7692")) throw new Error("Event pilot requires dedicated local port 7692");
  if (mode === "pilot-science-v2" && (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "7691")) throw new Error("Science v2 requires dedicated local port 7691");
  if (mode === "pilot-science-v1" && (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "7690")) throw new Error("Science pilot requires dedicated local port 7690");
  if (mode === "pilot-urasawa-v2" && (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "7689")) throw new Error("Pilot v2 requires dedicated port 7689");
  if (mode === "pilot-urasawa-v1" && (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== "7688")) {
    throw new Error("Pilot must use the dedicated local Neo4j port 7688");
  }
  if (mode === "demo" && ["7688", "7689", "7690", "7691", "7692"].includes(target.port)) throw new Error("Demo cannot use the pilot Neo4j port");
}
export function assertDemoTestTarget(env: Record<string, string | undefined> = process.env) {
  if (datasetMode(env.GRAPH_DATASET) !== "demo") throw new Error("Demo regression tests cannot run against a pilot dataset");
  if (env.NEO4J_URI) assertDatasetTarget("demo", env.NEO4J_URI);
}
