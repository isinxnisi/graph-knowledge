export const DATASET_MODES = ["demo", "pilot-urasawa-v1", "pilot-urasawa-v2", "pilot-science-v1"] as const;
export type DatasetMode = typeof DATASET_MODES[number];
export function datasetMode(value: string | undefined): DatasetMode {
  if (value === undefined || value === "demo") return "demo";
  if (DATASET_MODES.includes(value as DatasetMode)) return value as DatasetMode;
  throw new Error("Unknown GRAPH_DATASET");
}
export function assertDatasetTarget(mode: DatasetMode, uri: string) {
  const target = new URL(uri);
  if (mode === "pilot-science-v1" && (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "7690")) throw new Error("Science pilot requires dedicated local port 7690");
  if (mode === "pilot-urasawa-v2" && (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "7689")) throw new Error("Pilot v2 requires dedicated port 7689");
  if (mode === "pilot-urasawa-v1" && (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== "7688")) {
    throw new Error("Pilot must use the dedicated local Neo4j port 7688");
  }
  if (mode === "demo" && ["7688", "7689", "7690"].includes(target.port)) throw new Error("Demo cannot use the pilot Neo4j port");
}
export function assertDemoTestTarget(env: Record<string, string | undefined> = process.env) {
  if (datasetMode(env.GRAPH_DATASET) !== "demo") throw new Error("Demo regression tests cannot run against a pilot dataset");
  if (env.NEO4J_URI) assertDatasetTarget("demo", env.NEO4J_URI);
}
