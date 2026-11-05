import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { knowledgeThemeHome } from "../../../../lib/server/knowledge-theme-home";
import { knowledgeReadGuard } from "../../../../lib/server/knowledge-read-runtime";
import { knowledgePublicationPreview } from "../../../../lib/server/knowledge-publication-preview";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
export async function GET(request: Request) {
  try {
    knowledgeReadGuard(request);
    const params = new URL(request.url).searchParams;
    const mode = params.get("mode") ?? "search";
    const generation = params.get("generation") ?? undefined;
    const service = await knowledgePublicationPreview();
    let result: unknown;
    if (mode === "theme-home") result = await knowledgeThemeHome(service);
    else if (mode === "status") result = await service.status();
    else if (mode === "themes") result = await service.themes({ ...(params.has("entityId") ? { entityId: params.get("entityId")! } : {}), ...(params.has("q") ? { q: params.get("q")! } : {}), ...(params.has("kind") ? {kind:params.get("kind")!} : {}), ...(params.has("order") ? {order:params.get("order")!} : {}) });
    else if (mode === "theme") result = await service.theme({ themeId: params.get("themeId") ?? "", ...(params.has("revision") ? { revision: Number(params.get("revision")) } : {}) });
    else if (mode === "entities") result = await service.entities({ generation, ...(params.has("entityId") ? { entityId: params.get("entityId")! } : {}), ...(params.has("entityIds") ? { entityIds: (params.get("entityIds") ?? "").split(",").filter(Boolean) } : {}), ...(params.has("q") ? { q: params.get("q")! } : {}), ...(params.has("kind") ? { kind: params.get("kind")! } : {}), limit: Number(params.get("limit") ?? 20), ...(params.has("cursor") ? { cursor: params.get("cursor")! } : {}) });
    else if (mode === "facets") result = await service.facets({ generation });
    else if (mode === "record-version") result = await service.recordVersion(params.get("recordId")??"",Number(params.get("revision")));
    else if (mode === "record") result = await service.detail({ generation, recordId: params.get("recordId") ?? "" });
    else if (mode === "graph") result = await service.graph({ generation, recordIds: (params.get("recordIds") ?? "").split(",").filter(Boolean) });
    else if (mode === "neighbors") {
      const direction = params.get("direction") ?? "both";
      if (direction !== "both" && direction !== "in" && direction !== "out") return NextResponse.json({ error: "関係の向きが不正です" }, { status: 400, headers });
      result = await service.neighbors({ generation, entityId: params.get("entityId") ?? "", direction, limit: Number(params.get("limit") ?? 20), ...(params.has("cursor") ? { cursor: params.get("cursor")! } : {}) });
    }
    else if (mode === "paths") result = await service.paths({ generation, fromEntityId: params.get("from") ?? "", toEntityId: params.get("to") ?? "", maxDepth: Number(params.get("maxDepth") ?? 3), limit: Number(params.get("limit") ?? 10) });
    else if (mode === "search") {
      const query: Record<string, unknown> = {};
      for (const [key, value] of params) if (key !== "mode") query[key] = key === "limit" ? Number(value) : value;
      result = await service.search(query);
    } else return NextResponse.json({ error: "読取方法が不正です" }, { status: 400, headers });
    return NextResponse.json(result, { headers });
  } catch (error) {
    const status = error instanceof ZodError ? 400 : error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 503;
    const message = error instanceof ZodError ? "検索条件を確認してください" : status < 500 && error instanceof Error ? error.message : "読取データを準備できません。処理状態を確認して再試行してください。";
    return NextResponse.json({ error: message }, { status, headers });
  }
}
