export type DatasetMode = "demo" | "pilot-urasawa-v1" | "pilot-urasawa-v2";
export function datasetMode(value: string | undefined): DatasetMode {
  if (value === undefined || value === "demo") return "demo";
  if (value === "pilot-urasawa-v1" || value === "pilot-urasawa-v2") return value;
  throw new Error("GRAPH_DATASET must be demo, pilot-urasawa-v1 or pilot-urasawa-v2");
}
export function assertDatasetTarget(mode: DatasetMode, uri: string) {
  const target = new URL(uri);
  if (mode === "pilot-urasawa-v2" && (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "7689")) throw new Error("Pilot v2 requires dedicated port 7689");
  if (mode === "pilot-urasawa-v1" && (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== "7688")) {
    throw new Error("Pilot must use the dedicated local Neo4j port 7688");
  }
  if (mode === "demo" && ["7688", "7689"].includes(target.port)) throw new Error("Demo cannot use the pilot Neo4j port");
}
export function assertDemoTestTarget(env: Record<string, string | undefined> = process.env) {
  if (datasetMode(env.GRAPH_DATASET) !== "demo") throw new Error("Demo regression tests cannot run against a pilot dataset");
  if (env.NEO4J_URI) assertDatasetTarget("demo", env.NEO4J_URI);
}
