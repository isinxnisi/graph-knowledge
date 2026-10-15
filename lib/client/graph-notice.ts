import { workspaceLabels } from "../i18n/workspace";
import { overviewLabels } from "../i18n/entity-overview";
import { explorationLabels } from "../i18n/exploration";
import { graphNoticeLabels } from "../i18n/graph-notice";
import { contentMessage } from "../i18n/content";
export type GraphNoticePresentation = { kind: "info" | "warning"; text: string; detail: string };
// Exact known successes only. Missing branches and unknown messages stay persistent.
export function graphNoticePresentation(message: string | null, locale = "ja"): GraphNoticePresentation | null {
  if (!message) return null;
  const labels = graphNoticeLabels(locale);
  for (const language of ["ja", "en"]) {
    const known = new Map([
      [workspaceLabels(language).restored(0), labels.restored],
      [overviewLabels(language).restored, labels.previous],
      [explorationLabels(language).changed, labels.conditions],
    ]);
    if (known.has(message)) return { kind: "info", text: known.get(message)!, detail: contentMessage(message, locale) };
  }
  const cached = ["取得済みの枝を復元しました。", "Fetched branches restored."];
  const closed = ["展開を閉じました。別の展開が支える関係は残ります。", "Branch closed. Relations supported by other open branches remain."];
  const fetching = ["以前の枝はキャッシュから外れたため、近傍を再取得します。", "取得済みの枝がないため近傍を取得します。"];
  if (fetching.some(original => message === original || message === contentMessage(original, "en"))) return { kind: "info", text: labels.fetching, detail: contentMessage(message, locale) };
  if (cached.includes(message)) return { kind: "info", text: labels.cached, detail: contentMessage(message, locale) };
  if (closed.includes(message)) return { kind: "info", text: labels.closed, detail: contentMessage(message, locale) };
  return { kind: "warning", text: contentMessage(message, locale), detail: contentMessage(message, locale) };
}
