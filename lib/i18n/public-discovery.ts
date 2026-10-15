import type { PublicLocale } from "../domain/public-routes";
export function discoveryLabels(locale: PublicLocale) {
  return locale === "en" ? {
    title: "Plunode — Explore connections in a knowledge graph",
    description: "Discover connections between people, works, organizations and events. Follow an interactive knowledge graph and read the sources behind each connection.",
    heading: "Follow a connection. Find a new curiosity.",
    introduction: "Plunode is an interactive knowledge graph for discovering how people, works, organizations and events connect. Start with a subject, expand its connections, and read the records and sources behind them. Public exploration is free and does not require an account.",
    examples: "Places to start", about: "About this subject", relations: "A few recorded connections", sources: "Sources for these records", aliases: "Also recorded as",
    scope: "These are examples of published records, not a complete list. A connection represents recorded information, not a guarantee of truth. Roles and dates apply only within the scope confirmed by the source.",
    original: "Names, descriptions and source titles below are preserved as recorded; they may be in another language.",
    explore: "Explore this subject", kinds: { person: "Person", work: "Work", organization: "Organization", event: "Event" },
    entityTitle: (name: string) => `${name} — Connections and sources | Plunode`,
    entityDescription: (name: string, kind: string) => `Explore connections involving ${name} (${kind}) on Plunode. Follow related people, works, organizations and events, and read the published records and their sources.`,
  } : {
    title: "Plunode — 知識のつながりを探索する",
    description: "人物・作品・組織・出来事の関係を、資料とともに辿る知識の地図。小さな発見から、次の好奇心へ。",
    heading: "ひとつのつながりから、次の好奇心へ。",
    introduction: "Plunodeは、人物・作品・組織・出来事のつながりを辿る知識の地図です。気になる対象から関係を広げ、その関係を記録した資料へ進めます。公開Graphの探索は無料で、アカウント登録は不要です。",
    examples: "ここから探索する", about: "この対象について", relations: "登録されている関係の一例", sources: "この記録の出典", aliases: "登録されている別名",
    scope: "公開された記録の一例です。全ての関係を網羅せず、関係の成立を保証するものではありません。役割・期間は資料で確認された範囲に限ります。",
    original: "名称・説明・資料名は、登録された原文のまま表示しています。",
    explore: "この対象から探索する", kinds: { person: "人物", work: "作品", organization: "組織", event: "出来事" },
    entityTitle: (name: string) => `${name}の関係と出典 — Plunode`,
    entityDescription: (name: string, kind: string) => `${name}（${kind}）と人物・作品・組織・出来事のつながりを探索。公開された記録と、その根拠になった資料をPlunodeで確認できます。`,
  };
}
