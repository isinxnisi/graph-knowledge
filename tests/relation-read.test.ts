import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/neo4j", () => ({ openDatabase: vi.fn(), readQueryTimeout: () => 5000 }));
import { openDatabase } from "../lib/server/neo4j";
import { readRelationTransaction } from "../lib/server/read-db";
const tx = { commit: vi.fn(), rollback: vi.fn(), run: vi.fn() };
const session = { beginTransaction: vi.fn(() => tx), close: vi.fn() };
const driver = { session: vi.fn(() => session) };
beforeEach(() => {
  delete (globalThis as { graphReadDatabase?: unknown }).graphReadDatabase;
  vi.clearAllMocks(); tx.commit.mockResolvedValue(undefined); tx.rollback.mockResolvedValue(undefined); session.close.mockResolvedValue(undefined);
  vi.mocked(openDatabase).mockReturnValue({ driver, database: "neo4j" } as never);
});
it("READ sessionで一回だけ開始し、成功時commit・失敗時rollback、managed retryを使わない", async () => {
  expect(await readRelationTransaction(async () => "ok", new AbortController().signal)).toBe("ok");
  expect(driver.session).toHaveBeenCalledWith({ database: "neo4j", defaultAccessMode: "READ" });
  expect(session.beginTransaction).toHaveBeenCalledWith({ timeout: 5000 }); expect(tx.commit).toHaveBeenCalledOnce(); expect(tx.rollback).not.toHaveBeenCalled();
  const action = vi.fn().mockRejectedValue(new Error("unavailable"));
  await expect(readRelationTransaction(action, new AbortController().signal)).rejects.toThrow("unavailable");
  expect(action).toHaveBeenCalledOnce(); expect(tx.rollback).toHaveBeenCalledOnce();
});
it("Abort時はsessionを閉じ、遅着の結果をcommitしない", async () => {
  const controller = new AbortController(); let finish: (v: string) => void = () => {};
  const pending = readRelationTransaction(() => new Promise<string>(r => { finish = r; }), controller.signal);
  controller.abort(); expect(session.close).toHaveBeenCalled(); finish("late");
  await expect(pending).rejects.toThrow(); expect(tx.commit).not.toHaveBeenCalled(); expect(tx.rollback).toHaveBeenCalledOnce();
});
