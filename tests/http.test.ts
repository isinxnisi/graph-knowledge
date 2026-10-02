import { vi, describe, expect, it } from "vitest";
import { Neo4jError } from "neo4j-driver";
import { handle, neighborsInput, parseId, searchInput } from "../lib/server/http";

describe("API input and errors", () => {
  it("normalizes search with the same function used by seed", () => {
    expect(searchInput(new Request("http://localhost/api/entities?q=%20ＡＢＣ%20"))).toEqual({ q: "abc", limit: 10 });
    expect(neighborsInput(new Request("http://localhost/api/entities/id/neighbors"))).toEqual({ limit: 20, after: null });
    expect(parseId("EA5804DC-246C-4FD2-A960-B3350C8671E4")).toBe("ea5804dc-246c-4fd2-a960-b3350c8671e4");
  });
  it.each(["?q=", "?q=x&q=y", "?q=x&limit=0", "?q=x&limit=21", "?q=x&limit=1.5", "?q=x&limit=1e1", "?q=x&limit=1&limit=2"])("rejects malformed input %s", (query) => {
    expect(() => searchInput(new Request(`http://localhost/api/entities${query}`))).toThrow();
  });
  it.each(["ServiceUnavailable", "SessionExpired", "Neo.ClientError.Transaction.TransactionTimedOutClientConfiguration", "Neo.TransientError.Transaction.TransactionTimedOut"])("maps %s to 503 without details", async (code) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await handle(async () => { throw new Neo4jError("secret DB detail", code, "50N42", "test error"); });
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret DB detail");
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally { spy.mockRestore(); }
  });
  it("does not mistake invalid stored data or a query bug for invalid API input", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await handle(async () => { throw new Neo4jError("private Cypher", "Neo.ClientError.Statement.SyntaxError", "50N42", "test error"); });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "処理中にエラーが発生しました。" } });
    } finally { spy.mockRestore(); }
  });
});
