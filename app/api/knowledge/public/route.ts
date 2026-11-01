import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { themeGuard } from "../../../../lib/server/theme-workbench";
import { knowledgePublicationPreview } from "../../../../lib/server/knowledge-publication-preview";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
export async function GET(request: Request) {
  try {
    themeGuard(request);
    const params = new URL(request.url).searchParams;
    const mode = params.get("mode") ?? "search";
    const generation = params.get("generation") ?? undefined;
    const service = await knowledgePublicationPreview();
    let result: unknown;
    if (mode === "status") result = await service.status();
    else if (mode === "facets") result = await service.facets({ generation });
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
