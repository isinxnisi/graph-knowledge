import { expect, it } from "vitest";
import { neighborRankingConfig, encodeRankedCursor, decodeRankedCursor, isRankedCursor } from "../lib/server/neighbor-ranking";
const scope = { center: "00000000-0000-4000-8000-000000000001", condition: "roles-and-polarity", revision: "r1", candidates: 1000, connections: 50 };
const position = { round: 2, rank: 4, neighbor: "00000000-0000-4000-8000-000000000002" };
it("境界値は運営者設定だけから読み、無効値を黙って補正しない", () => {
  expect(neighborRankingConfig({ GRAPH_DATASET: "public-kg" })).toEqual({ enabled: true, candidates: 200, connections: 50 });
  expect(neighborRankingConfig({ GRAPH_DATASET: "demo" }).enabled).toBe(false);
  expect(neighborRankingConfig({ GRAPH_DATASET: "public-kg", GRAPH_NEIGHBOR_ORDER: "id" }).enabled).toBe(false);
  for (const value of ["0", "-1", "NaN", "1.5", "2001"]) expect(() => neighborRankingConfig({ GRAPH_NEIGHBOR_CANDIDATES: value })).toThrow();
});
it("新cursorは順位位置・起点・条件・revision・上限を拘束する", () => {
  const cursor = encodeRankedCursor(scope, position);
  expect(isRankedCursor(cursor)).toBe(true); expect(decodeRankedCursor(cursor, scope)).toEqual(position);
  expect(isRankedCursor(null)).toBe(false); expect(isRankedCursor(scope.center)).toBe(false);
  expect(() => decodeRankedCursor(cursor, { ...scope, condition: "other" })).toThrow();
  expect(() => decodeRankedCursor(cursor, { ...scope, revision: "r2" })).toThrow();
  expect(() => decodeRankedCursor(cursor, { ...scope, connections: 20 })).toThrow();
  expect(() => decodeRankedCursor("bad", scope)).toThrow();
});
