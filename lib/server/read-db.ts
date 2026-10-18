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

// New relation searches have one transaction and no managed retry. The caller
// owns the overall deadline; aborting closes the session as well as the response.
export async function readRelationTransaction<T>(action: (tx: import("neo4j-driver").Transaction) => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  const connection = globalDatabase.graphReadDatabase ??= openDatabase();
  const session = connection.driver.session({ database: connection.database, defaultAccessMode: "READ" });
  const cancel = () => { void session.close().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const tx = session.beginTransaction({ timeout: readQueryTimeout() });
    try {
      const result = await action(tx);
      signal.throwIfAborted();
      await tx.commit();
      return result;
    } catch (error) { await tx.rollback().catch(() => {}); throw error; }
  } finally { signal.removeEventListener("abort", cancel); await session.close(); }
}
