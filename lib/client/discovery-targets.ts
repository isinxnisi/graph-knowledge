import { CLIENT_REQUEST_TIMEOUT_MS, ClientApiError } from "./api";
import { targetSearchRequestSchema, targetSearchResponseSchema, targetCriteriaKey, type TargetSearchRequest } from "../domain/discovery-targets";

// Unconnected to UI in STEP 2. Callers supply the prior response revision when paging.
export async function fetchDiscoveryTargets(input: TargetSearchRequest, signal: AbortSignal) {
  const request = targetSearchRequestSchema.parse(input), controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("/api/discovery/entities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), cache: "no-store", signal: controller.signal });
    const body = await response.json(); controller.signal.throwIfAborted();
    if (!response.ok) throw new ClientApiError(typeof body?.error?.message === "string" ? body.error.message : "対象検索を確認できませんでした。", response.status);
    const result = targetSearchResponseSchema.parse(body);
    if (targetCriteriaKey(result.criteria) !== targetCriteriaKey(request.criteria)) throw new ClientApiError("検索条件が一致しません。", 0);
    if (request.revision !== null && result.revision !== request.revision) throw new ClientApiError("公開版が変わりました。再検索してください。", 409);
    return result;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (controller.signal.aborted) throw new ClientApiError("対象検索を確認できませんでした。再試行してください。", 0);
    if (error instanceof ClientApiError) throw error;
    throw new ClientApiError("対象検索の応答を確認できませんでした。", 0);
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}
