const ja = {
  title: "自分の投稿", open: "自分の投稿を見る", hide: "投稿一覧を閉じる",
  help: "この環境で投稿した自分のコメントだけを、新しい順に表示します。共有リンクが失効しても撤回できます。",
  boundary: "投稿先の題名・説明や他の人の会話は表示しません。Capsuleが削除されると、その投稿も一覧から消えます。",
  refresh: "この一覧を再確認", newest: "新しい投稿から見る", next: "前の投稿20件を見る",
  loading: "自分の投稿を確認しています…", empty: "このページに自分の投稿はありません。",
  context: (revision: number) => `内容版 ${revision} への投稿`,
  target: "投稿先の識別情報", capsule: "Capsule ID", post: "投稿 ID",
  withdrawn: "この投稿は撤回済みです。", done: "投稿を撤回しました。",
  failed: "投稿一覧を取得できませんでした。再確認してください。",
  uncertain: "撤回結果を確認できませんでした。この一覧を再確認して状態を確かめてください。",
  gone: "投稿が見つかりません。投稿先が削除された可能性があります。一覧を再確認してください。",
  expired: "ログインが変わったか期限が切れました。アカウントを再確認してください。",
  manageLink: "自分の投稿を確認・撤回（アカウント・別タブ）",
} as const;
export function memberPostsLabels(locale = "ja") { void locale; return ja; }
