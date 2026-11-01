import {
  themeGuard,
  themeState,
  themeDocument,
  themeRecordKeys,
} from "../../../../lib/server/theme-workbench";
export async function GET(req: Request) {
  try {
    themeGuard(req);
    const t = (await themeState()).themes.find(
      (t) => t.id === new URL(req.url).searchParams.get("theme"),
    );
    if (!t)
      return Response.json({ error: "テーマがありません" }, { status: 404 });
    return Response.json(
      {
        id: "00000000-0000-4000-a000-000000000075",
        dataset: "public-kg",
        revision: t.revision,
        title: t.title.slice(0, 80),
        note: t.description.slice(0, 4000),
        language: "ja",
        createdAt: t.createdAt,
        entityIds: [],
        claimIds: [],
        recordKeys: themeRecordKeys(t.id, t.records),
        document: themeDocument({
          themeId: t.id,
          themeRevision: t.revision,
          entities: t.entities,
          records: t.records,
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "確認環境に接続できません" },
      { status: 503 },
    );
  }
}
