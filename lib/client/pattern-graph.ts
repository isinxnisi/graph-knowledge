import { CLIENT_REQUEST_TIMEOUT_MS, ClientApiError } from "./api";
import { patternGraphRequestSchema, patternGraphResponseSchema, routeKey, type PatternGraphRequest } from "../domain/pattern-graph";
import { relationConditionKey } from "../domain/relation-conditions";

export async function fetchPatternGraph(input: PatternGraphRequest, signal: AbortSignal) {
  const request = patternGraphRequestSchema.parse({...input,version:input.relation.pattern.revision!==1?2:input.version}), controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true }); if (signal.aborted) cancel();
  const timer = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("/api/discovery/paths", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), cache: "no-store", signal: controller.signal });
    const body = await response.json(); controller.signal.throwIfAborted();
    if (!response.ok) throw new ClientApiError(typeof body?.error?.message === "string" ? body.error.message : "経路を確認できませんでした。", response.status);
    const result = patternGraphResponseSchema.parse(body);
    if (result.root.id !== request.rootId || result.operation !== request.operation.type || relationConditionKey(result.relation) !== relationConditionKey(request.relation)) throw Error("Unexpected pattern response");
    if (request.revision && result.revision !== request.revision) throw new ClientApiError("公開版が変わりました。", 409);
    if (request.operation.type === "page" && request.operation.requiredWitness && (result.operation !== "page" || JSON.stringify(result.requiredRoute) !== JSON.stringify(request.operation.requiredWitness.route))) throw Error("Missing required witness");
    if (request.operation.type === "restore") {
      const requested = new Map(request.operation.routes.map(r => [routeKey(r), JSON.stringify(r)]));
      if (result.operation !== "restore" || result.verifiedRoutes.length !== requested.size || result.verifiedRoutes.some(r => requested.get(routeKey(r)) !== JSON.stringify(r))) throw Error("Incomplete restoration");
    }
    return result;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (controller.signal.aborted) throw new ClientApiError("経路の取得を中断しました。再試行してください。", 0);
    if (error instanceof ClientApiError) throw error;
    throw new ClientApiError("経路の応答を確認できませんでした。", 0);
  } finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); }
}
