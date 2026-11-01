import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { themeGuard } from "../../../lib/server/theme-workbench";
import { knowledgePreview, knowledgePreviewActor } from "../../../lib/server/knowledge-preview";
import type { KnowledgeChange, KnowledgeSourceVersion } from "../../../lib/domain/knowledge-foundation";
import { themeTimeLabel } from "../../../lib/domain/theme-time";
import type { ThemeTime } from "../../../lib/domain/theme-workbench";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
function failure(error: unknown) {
  const status = error instanceof ZodError ? 400 : error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 503;
  const message = error instanceof ZodError ? error.issues.map((e) => e.path.join(".") + ": " + e.message).join(" / ") : status < 500 && error instanceof Error ? error.message : "保存先に接続できません。入力を保持して再試行できます。";
  return NextResponse.json({ error: message }, { status, headers: privateHeaders });
}
function content(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const object = value as Record<string, unknown>;
  return object.content && typeof object.content === "object" ? object.content as Record<string, unknown> : object;
}
function fieldText(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "なし";
  if (key === "polarity") return ({ affirmed: "肯定", denied: "否定", uncertain: "不確実" } as Record<string, string>)[String(value)] ?? String(value);
  if (key === "times" && Array.isArray(value)) return value.map((t) => themeTimeLabel(t.time as ThemeTime)).join(" / ") || "なし";
  if (key === "evidence" && Array.isArray(value)) return value.map((e) => `${e.locator}：${e.excerpt || "抜粋なし"}（資料版 ${e.source.revision}・${e.stance}）`).join(" / ");
  if (key === "aliases" && Array.isArray(value)) return value.join("、") || "なし";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
function changeRows(change: KnowledgeChange) {
  const before = content(change.before), after = content(change.after);
  const labels: Record<string, string> = { name: "名前", title: "資料名", aliases: "別名", kind: "種類", description: "説明", language: "言語", assertion: "内容", relation: "関係の言葉", polarity: "肯否", scope: "範囲", subjectId: "対象", objectId: "相手", times: "時期", evidence: "根拠", url: "URL", bibliography: "書誌", concept: "意味対応", recordRevision: "意味対応の内容版" };
  const prefix = ({ entity: "対象", source: "資料", record: "記録", theme: "テーマ", mapping: "意味対応" })[change.kind];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map((key) => ({ kind: change.kind, label: `${prefix}・${labels[key] ?? key} · 版 ${change.beforeRevision ?? "なし"} → ${change.afterRevision ?? "なし"}`, before: fieldText(key, before[key]), after: fieldText(key, after[key]) }));
}
export async function GET(request: Request) {
  try {
    themeGuard(request);
    const service = await knowledgePreview();
    const themeId = new URL(request.url).searchParams.get("theme");
    if (themeId) {
      const resolved = await service.resolveTheme(knowledgePreviewActor, themeId);
      const diff = await service.diffTheme(knowledgePreviewActor, themeId);
      return NextResponse.json({ resolved: { theme: resolved.theme, ...resolved.snapshot }, changes: diff.changes.flatMap(changeRows), unavailable: diff.unavailable, refreshToken: diff.refreshToken }, { headers: privateHeaders });
    }
    const data = await service.list(knowledgePreviewActor);
    const sourceVersions = new Map<string, KnowledgeSourceVersion>(data.sources.map((s) => [s.id + ":" + s.revision, s]));
    for (const r of data.records) for (const e of r.content.evidence) {
      const key = e.source.id + ":" + e.source.revision;
      if (!sourceVersions.has(key)) sourceVersions.set(key, await service.get(knowledgePreviewActor, "source", e.source.id, e.source.revision));
    }
    return NextResponse.json({ ...data, sourceVersions: [...sourceVersions.values()] }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    themeGuard(request, true);
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "入力がありません" }, { status: 400, headers: privateHeaders });
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2_000_000) { await reader.cancel(); return NextResponse.json({ error: "入力は2MBまでにしてください" }, { status: 413, headers: privateHeaders }); }
      chunks.push(part.value);
    }
    let command: unknown;
    try { command = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return NextResponse.json({ error: "入力形式を確認してください" }, { status: 400, headers: privateHeaders }); }
    const service = await knowledgePreview();
    return NextResponse.json(await service.execute(knowledgePreviewActor, command), { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
