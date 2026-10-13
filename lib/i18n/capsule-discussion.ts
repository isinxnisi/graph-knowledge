const ja = {
  title: "この版のコメント", open: "この版のコメントを見る", refresh: "コメントとログインを再確認", loading: "コメントを確認しています…",
  context: (revision: number) => `内容版 ${revision} についての会話です。`,
  help: "コメントはこのCapsuleへの意見・説明です。知識や出典の支持として登録されません。他の版の投稿はここには表示しません。",
  empty: "この版のコメントはまだありません。", login: "投稿するにはアカウントへログイン（別タブ）", loginHelp: "ログイン後、この画面へ戻って再確認してください。",
  as: (name: string) => `${name} として投稿します。表示名と本文は、作成者とこの版の有効なリンクを持つ人が読めます。`,
  body: "コメント本文", limit: "2,000文字まで。1人につき1分間に5件、Capsule全体で200件まで。", submit: "この版へ投稿する",
  retry: "同じ投稿の結果を確認・再送", pending: "投稿結果が不明です。同じ内容を再送して結果を確認できます。二重には登録しません。",
  failed: "操作を完了できませんでした。再確認してから試してください。", unavailable: "この版のコメントを閲覧できません。共有済みの版と権限を確認してください。",
  expired: "ログインが変わったか期限が切れました。ログインを再確認してください。入力は元の本人が戻るまで表示しません。",
  closed: "新しい投稿は受け付けていません。作成者が受付を開始できます。自分の投稿の撤回はできます。", close: "新しい投稿を停止する", reopen: "投稿を受け付ける",
  manageHelp: "投稿の受付は、このCapsuleのすべての共有版に共通です。停止・再開は他の版にも反映されます。",
  stopped: "投稿の受付状態を更新しました。", posted: "投稿しました。", withdrawn: "投稿者が撤回しました。", hidden: "この投稿は表示できません。",
  withdraw: "自分の投稿を撤回", confirmWithdraw: "本文を削除して撤回する", cancel: "取り消す", withdrawHelp: "本文を削除し、撤回した記録だけ残します。すでに読まれたコピーは回収できません。",
  rate: "投稿が続いています。1分ほど待ってから送信してください。", full: "このCapsuleの投稿上限に達しました。既存のコメントは読めます。",
  conflict: "別の画面で状態が変わりました。再確認してください。", savedDraft: "未送信の入力は本人と版ごとに、このタブだけに残ります。同じ版に戻ると再開できます。再読み込みすると失われます。",
};
const en: typeof ja = {
title: "Comments on this version", open: "View comments on this version", refresh: "Refresh comments and login", loading: "Loading comments…",
  context: (revision: number) => `Discussion of version ${revision}.`,
  help: "Comments are opinions or explanations about this Capsule. They are not registered as knowledge or support for sources. Comments on other versions are not shown here.",
  empty: "No comments on this version yet.", login: "Log in to comment (new tab)", loginHelp: "After logging in, return here and refresh.",
  as: (name: string) => `Commenting as ${name}. Your display name and text are visible to the creator and people with a valid link to this version.`,
  body: "Comment text", limit: "Up to 2,000 characters. Five comments per person per minute; 200 per Capsule.", submit: "Post to this version",
  retry: "Check or resend the same comment", pending: "The result is unknown. Resend the same content to check it without creating a duplicate.",
  failed: "Could not complete the action. Refresh before trying again.", unavailable: "Comments on this version are unavailable. Check the shared version and your access.",
  expired: "Your login changed or expired. Check it again. Draft text stays hidden until its original author returns.",
  closed: "New comments are closed. The creator can reopen them. You can still withdraw your own comments.", close: "Close new comments", reopen: "Accept comments",
  manageHelp: "Comment acceptance applies to all shared versions of this Capsule. Closing or reopening also affects other versions.",
  stopped: "Comment acceptance updated.", posted: "Comment posted.", withdrawn: "Withdrawn by the author.", hidden: "This comment cannot be displayed.",
  withdraw: "Withdraw my comment", confirmWithdraw: "Delete text and withdraw", cancel: "Cancel",
  withdrawHelp: "Deletes the text and retains a withdrawal record. Copies already read cannot be recalled.",
  rate: "Too many recent comments. Wait about a minute before posting.", full: "This Capsule's comment limit has been reached. Existing comments remain readable.",
  conflict: "The state changed in another view. Please refresh.",
  savedDraft: "Unsent text stays in this tab, separately for each author and version. Return to the same version to resume. Reloading clears it.",
};
export function capsuleDiscussionLabels(locale = "ja"): typeof ja {
  const resources: Record<string, typeof ja> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
