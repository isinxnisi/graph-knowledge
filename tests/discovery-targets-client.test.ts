import { afterEach, expect, it, vi } from "vitest";
import { fetchDiscoveryTargets } from "../lib/client/discovery-targets";
import type { TargetSearchRequest } from "../lib/domain/discovery-targets";
const request: TargetSearchRequest = { version: 1, dataset: "public-kg", criteria: { q: "", kind: null, relation: null }, revision: "r1", after: null };
const response = { version: 1, dataset: "public-kg", revision: "r1", criteria: request.criteria, items: [], page: { limit: 20, hasMore: false, nextCursor: null, total: { status: "not-counted" } } };
afterEach(() => { vi.unstubAllGlobals(); });
it("JSON POST・条件・公開版を渡し、異なる条件／版の応答を適用しない", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(response)); vi.stubGlobal("fetch", fetcher);
  await expect(fetchDiscoveryTargets(request, new AbortController().signal)).resolves.toEqual(response);
  expect(fetcher.mock.calls[0]).toEqual(["/api/discovery/entities", expect.objectContaining({ method: "POST", body: JSON.stringify(request), cache: "no-store" })]);
  fetcher.mockResolvedValueOnce(Response.json({ ...response, revision: "r2" })); await expect(fetchDiscoveryTargets(request, new AbortController().signal)).rejects.toMatchObject({ status: 409 });
  fetcher.mockResolvedValueOnce(Response.json({ ...response, criteria: { ...response.criteria, q: "other" } })); await expect(fetchDiscoveryTargets(request, new AbortController().signal)).rejects.toMatchObject({ status: 0 });
  fetcher.mockResolvedValueOnce(Response.json({ error: { code: "SERVICE_UNAVAILABLE", reason: "UNCONFIRMED" } }, { status: 503 })); await expect(fetchDiscoveryTargets(request, new AbortController().signal)).rejects.toMatchObject({ status: 503 });
});
