import "server-only";
import type { ManagedTransaction } from "neo4j-driver";
import { openDatabase, readQueryTimeout } from "./neo4j";

const globalDatabase = globalThis as typeof globalThis & { graphReadDatabase?: ReturnType<typeof openDatabase> };

export async function readTransaction<T>(action: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
  const timeout = readQueryTimeout();
  // Lazy initialization allows the app to build without DB credentials or connectivity.
  const connection = globalDatabase.graphReadDatabase ??= openDatabase();
  const session = connection.driver.session({ database: connection.database, defaultAccessMode: "READ" });
  try { return await session.executeRead(action, { timeout }); }
  finally { await session.close(); }
}
