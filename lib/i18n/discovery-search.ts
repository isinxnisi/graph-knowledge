const ja = {
  title: "知識を探す", entry: "一覧・条件から探す", homeEntry: "名前やテーマから探す", close: "検索を閉じる", placeholder: "名前・別名を入力（空欄でも探せます）",
  introduction: "名前やつながりから、探索の起点を見つけましょう。", connections: "つながりから探す", scope: "選んだ対象と、公開された関係に出てくる相手を表示します。", around: (name: string) => `${name}の周辺`, all: "公開されている対象", order: "名前順 · 名前の完全一致を優先", next: "次の20件", previous: "前の20件", retry: "検索をやり直す", page: (n: number) => `${n}ページ目`, more: "すべての結果を見る", empty: "この条件に一致する登録対象はありません。条件を変えるか、下のつながりから探せます。", hint: "対象を選ぶとGraphが開きます。", clear: "条件をクリア", language: "表示言語", suggestions: "入力中の候補",
};
const en: typeof ja = {
  title: "Discover knowledge", entry: "Browse & refine", homeEntry: "Find names & explore themes", close: "Close search", placeholder: "Name or alias (optional)", introduction: "Find a starting point by name or through its connections.", connections: "Explore through connections", scope: "Showing the selected entity and the other endpoints of its published relations.", around: name => `Around ${name}`, all: "Public entities", order: "Name order · Exact name matches first", next: "Next 20", previous: "Previous 20", retry: "Restart search", page: n => `Page ${n}`, more: "See all results", empty: "No registered entities match these conditions. Change the filters or try a connection below.", hint: "Choose an entity to open its Graph.", clear: "Clear filters", language: "Language", suggestions: "Suggestions",
};
export const discoverySearchLabels = (locale = "ja") => locale.startsWith("en") ? en : ja;
