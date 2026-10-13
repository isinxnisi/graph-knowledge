const ja = {
  title: "自分の投稿", open: "自分の投稿を見る", hide: "投稿一覧を閉じる",
  help: "この環境で投稿した自分のコメントだけを、新しい順に表示します。共有リンクが失効しても撤回できます。",
  boundary: "投稿先の題名・説明や他の人の会話は表示しません。Capsuleが削除されると、その投稿も一覧から消えます。",
  refresh: "この一覧を再確認", newest: "新しい投稿から見る", next: "前の投稿20件を見る",
  loading: "自分の投稿を確認しています…", empty: "このページに自分の投稿はありません。",
  context: (revision: number) => `内容版 ${revision} への投稿`,
  target: "投稿先の識別情報", capsule: "Capsule ID", post: "投稿 ID",
  hidden: "この投稿は表示できません。本文を削除して撤回することはできます。",
  withdrawn: "この投稿は撤回済みです。", done: "投稿を撤回しました。",
  failed: "投稿一覧を取得できませんでした。再確認してください。",
  uncertain: "撤回結果を確認できませんでした。この一覧を再確認して状態を確かめてください。",
  gone: "投稿が見つかりません。投稿先が削除された可能性があります。一覧を再確認してください。",
  expired: "ログインが変わったか期限が切れました。アカウントを再確認してください。",
  manageLink: "自分の投稿を確認・撤回（アカウント・別タブ）",
};
const en: typeof ja = {
title: "My comments", open: "View my comments", hide: "Close comment list",
  help: "Your comments in this environment, newest first. You can withdraw them even after a sharing link expires.",
  boundary: "The target's title, description and other people's comments are not shown. Deleting a Capsule also removes its comments from this list.",
  refresh: "Refresh this list", newest: "Show newest comments", next: "Show 20 earlier comments", loading: "Loading your comments…", empty: "You have no comments on this page.",
  context: (revision: number) => `Comment on version ${revision}`, target: "Target identifiers", capsule: "Capsule ID", post: "Comment ID",
  hidden: "This comment cannot be displayed. You can still delete its text and withdraw it.", withdrawn: "This comment was withdrawn.", done: "Comment withdrawn.",
  failed: "Could not load your comments. Please retry.", uncertain: "Could not confirm withdrawal. Refresh this list to check its status.",
  gone: "Comment not found. Its Capsule may have been deleted. Refresh the list.", expired: "Your login changed or expired. Check your account again.",
  manageLink: "Review or withdraw my comments (account, new tab)",
};
export function memberPostsLabels(locale = "ja"): typeof ja {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
