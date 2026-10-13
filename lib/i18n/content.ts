import { capsuleLabels } from "./capsules";
import { capsuleComparisonLabels } from "./capsule-comparison";
import { capsuleDiscussionLabels } from "./capsule-discussion";
import { capsuleHistoryLabels } from "./capsule-history";
import { capsuleSharingLabels } from "./capsule-sharing";
import { memberLabels } from "./member";
import { memberPostsLabels } from "./member-posts";
import { readingLabels } from "./reading-reference";
import { savedViewLabels } from "./saved-views";
import { workspaceLabels } from "./workspace";
import { explorerMessage } from "./explorer";

// UI通知専用。本文・題名・表示名・資料には使わない。
// 非同期処理や既存stateへlocaleを持ち込まず、表示時に解決する。
export function contentMessage(message: string | null, locale = "ja"): string {
  if (!message) return "";
  const dictionaries = [capsuleLabels, capsuleComparisonLabels, capsuleDiscussionLabels, capsuleHistoryLabels,
    capsuleSharingLabels, memberLabels, memberPostsLabels, readingLabels, savedViewLabels, workspaceLabels];
  for (const labels of dictionaries) {
    const japanese = labels("ja") as Record<string, unknown>, english = labels("en") as Record<string, unknown>;
    const key = Object.keys(japanese).find(key => typeof japanese[key] === "string" && (japanese[key] === message || english[key] === message));
    if (key) return String(locale.startsWith("en") ? english[key] : japanese[key]);
  }
  const imported = message.match(/^(\d+)件を追加しました。保存済みの(\d+)件はそのままです。$/)
    ?? message.match(/^Added (\d+) views\. Kept (\d+) already saved views\.$/);
  if (imported) return savedViewLabels(locale).imported(Number(imported[1]), Number(imported[2]));
  const restoredJa = message.match(/^現在のデータで探索途中を再開しました。保存時から関係が変わることがあります。(?:現在の関係から辿れない枝(\d+)件は再開していません。)?$/);
  const restoredEn = message.match(/^Resumed with current data\. Relations may differ from saving time\.(?: Did not resume (\d+) branches unreachable through current relations\.)?$/);
  if (restoredJa || restoredEn) return workspaceLabels(locale).restored(Number((restoredJa ?? restoredEn)![1] ?? 0));
  return explorerMessage(message, locale);
}
