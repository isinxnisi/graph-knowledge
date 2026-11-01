import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  themeGuard,
  themeState,
  executeThemeCommand,
  ThemeError,
  themeRecordKeys,
} from "../../../lib/server/theme-workbench";
import {
  themeRecordSearchText,
  themeDiff,
} from "../../../lib/domain/theme-workbench";
export const dynamic = "force-dynamic";
function fail(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof ZodError
          ? e.issues.map((i) => i.path.join(".") + ": " + i.message).join(" / ")
          : e instanceof ThemeError
            ? e.message
            : "保存先に接続できません。入力を保持して再試行してください。",
    },
    {
      status:
        e instanceof ZodError ? 400 : e instanceof ThemeError ? e.status : 503,
    },
  );
}
export async function GET(req: Request) {
  try {
    themeGuard(req);
    const s = await themeState(),
      u = new URL(req.url),
      shared = u.searchParams.get("shared"),
      id = u.searchParams.get("theme"),
      capsule = u.searchParams.get("capsule");
    const meaningCatalog = [
      ...new Map([
        ...(s.meanings ?? []).map((m) => [m.id, m] as const),
        ...s.themes.flatMap((t) =>
          t.records.flatMap((r) =>
            r.mapping?.concept
              ? [[r.mapping.concept.id, r.mapping.concept] as const]
              : [],
          ),
        ),
      ]).values(),
    ];
    let result: unknown;
    if (shared) {
      result =
        /^[A-Za-z0-9_-]{32}$/.test(shared) && Object.hasOwn(s.shares, shared)
          ? s.shares[shared]
          : undefined;
      if (!result)
        throw new ThemeError("この共有は停止済み、または見つかりません", 404);
      const sharedCap = s.shares[shared];
      result = {
        ...sharedCap,
        recordKeys: themeRecordKeys(
          sharedCap.snapshot.themeId,
          sharedCap.snapshot.records,
        ),
      };
    } else if (capsule) {
      const cap = s.capsules.find((c) => c.id === capsule);
      if (!cap) throw new ThemeError("Capsuleがありません", 404);
      result = {
        capsule: cap,
        recordKeys: themeRecordKeys(cap.snapshot.themeId, cap.snapshot.records),
        diff: themeDiff(
          cap.snapshot,
          s.themes.find((t) => t.id === cap.snapshot.themeId)!,
        ),
        themeRevision: s.themes.find((t) => t.id === cap.snapshot.themeId)!
          .revision,
      };
    } else if (id) {
      const theme = s.themes.find((t) => t.id === id);
      result = theme ? { ...theme, meaningCatalog } : undefined;
      if (!result) throw new ThemeError("テーマがありません", 404);
    } else if (u.searchParams.has("q") || u.searchParams.has("concept")) {
      const q = (u.searchParams.get("q") ?? "")
          .normalize("NFKC")
          .toLocaleLowerCase(),
        concept = u.searchParams.get("concept");
      result = s.themes.flatMap((t) =>
        t.records
          .filter(
            (r) =>
              (!concept ||
                (r.mapping?.recordRevision === r.revision &&
                  r.mapping?.concept?.id === concept)) &&
              (!q || themeRecordSearchText(r, t.entities).includes(q)),
          )
          .map((record) => ({
            themeId: t.id,
            themeTitle: t.title,
            record,
            entities: t.entities,
            match: concept ? "meaning" : "text",
          })),
      );
    } else
      result = {
        themes: s.themes.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          revision: t.revision,
          updatedAt: t.updatedAt,
          recordCount: t.records.length,
          unmappedCount: t.records.filter((r) => !r.mapping?.concept).length,
        })),
        capsules: s.capsules.map((c) => ({
          id: c.id,
          title: c.title,
          revision: c.revision,
          updatedAt: c.updatedAt,
          shareToken: c.shareToken,
          sharedRevision: c.sharedRevision,
        })),
      };
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    themeGuard(req, true);
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new ThemeError("JSONで送信してください");
    const text = await req.text();
    if (Buffer.byteLength(text) > 2_000_000)
      throw new ThemeError("入力が2MBを超えています", 413);
    return NextResponse.json(await executeThemeCommand(JSON.parse(text)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof SyntaxError)
      return NextResponse.json(
        { error: "JSONを確認してください" },
        { status: 400 },
      );
    return fail(e);
  }
}
