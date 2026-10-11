import { assertDatasetTarget, datasetMode } from "../domain/dataset";
import { existsSync } from "node:fs";
import neo4j from "neo4j-driver";

export const QUERY_TIMEOUT_MS = 5000;

export function readQueryTimeout(env: Record<string, string | undefined> = process.env): number {
  const value = env.NEO4J_READ_TIMEOUT_MS;
  if (value === undefined) return QUERY_TIMEOUT_MS;
  if (!/^\d+$/.test(value) || Number(value) < 5000 || Number(value) > 15000) throw new Error("NEO4J_READ_TIMEOUT_MS must be an integer from 5000 to 15000");
  return Number(value);
}

export function openDatabase() {
  if (process.env.GRAPH_DEPLOYMENT !== "production" && existsSync(".env")) process.loadEnvFile(".env");
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;
  const database = process.env.NEO4J_DATABASE;
  if (!uri || !user || !password || !database) {
    throw new Error("Set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD and NEO4J_DATABASE in .env");
  }
  assertDatasetTarget(datasetMode(process.env.GRAPH_DATASET), uri);
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    connectionTimeout: QUERY_TIMEOUT_MS,
    connectionAcquisitionTimeout: QUERY_TIMEOUT_MS,
    maxTransactionRetryTime: QUERY_TIMEOUT_MS,
  });
  return { driver, database };
}
