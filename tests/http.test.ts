import { vi, describe, expect, it } from "vitest";
import { Neo4jError } from "neo4j-driver";
import { handle, neighborsInput, parseId, searchInput } from "../lib/server/http";

describe("API input and errors", () => {
  it("normalizes search with the same function used by seed", () => {
    expect(searchInput(new Request("http://localhost/api/entities?q=%20ＡＢＣ%20"))).toEqual({ q: "abc", limit: 10 });
    expect(neighborsInput(new Request("http://localhost/api/entities/id/neighbors"))).toEqual({ limit: 20, after: null, predicates: null });
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

describe("関係条件とcursor", () => {
  const center = "ea5804dc-246c-4fd2-a960-b3350c8671e4";
  it("集合の順序・重複・全件を正規化し、空集合を区別する", () => {
    expect(neighborsInput(new Request("http://localhost/?predicates=INFLUENCED_BY,ASSISTANT_OF,ASSISTANT_OF")).predicates).toEqual(["ASSISTANT_OF", "INFLUENCED_BY"]);
    expect(neighborsInput(new Request("http://localhost/?predicates=")).predicates).toEqual([]);
    expect(neighborsInput(new Request("http://localhost/?predicates=ASSISTANT_OF,INFLUENCED_BY,CONTRIBUTED_TO,AFFILIATED_WITH")).predicates).toBeNull();
  });
  it.each(["predicates=UNKNOWN", "predicates=ASSISTANT_OF,", "predicates=ASSISTANT_OF&predicates=INFLUENCED_BY", "kind=work", "predicates=%27%20RETURN%201"])("未対応・不正条件を拒否する %s", (query) => {
    expect(() => neighborsInput(new Request(`http://localhost/?${query}`))).toThrow();
  });
  it("cursorを条件と起点に結び付け、無条件UUIDとの混用を拒否する", async () => {
    const { encodeNeighborCursor, decodeNeighborCursor } = await import("../lib/server/neighbor-cursor");
    const cursor = encodeNeighborCursor(center, ["ASSISTANT_OF"], center);
    expect(decodeNeighborCursor(cursor, center, ["ASSISTANT_OF"])).toBe(center);
    expect(() => decodeNeighborCursor(cursor, center, ["INFLUENCED_BY"])).toThrow();
    expect(() => decodeNeighborCursor(cursor, "b02aec28-1027-4b59-8a79-1be680576ac7", ["ASSISTANT_OF"])).toThrow();
    expect(() => decodeNeighborCursor(cursor, center, null)).toThrow();
    expect(() => decodeNeighborCursor(center, center, ["ASSISTANT_OF"])).toThrow();
    expect(decodeNeighborCursor(center, center, null)).toBe(center);
    expect(() => decodeNeighborCursor(Buffer.from(JSON.stringify({ v: 2, center, condition: "ASSISTANT_OF", after: center })).toString("base64url"), center, ["ASSISTANT_OF"])).toThrow();
  });
});
