import { RELATION_FACET_CATALOG, facetsForPredicates } from "../client/relation-facets";
import { relationFacetLabels } from "./relation-facets";
import { eventParticipationLabels } from "./event-participation";
import type { EventRoleFilter, OrganizationPositionFilter, ContributionRoleFilter, PredicateFilter } from "../domain/exploration";
import { PREDICATE_KEYS } from "../domain/predicates";
import { explorationLabels } from "./exploration";
import { contributionLabels } from "./contribution";
import { organizationParticipationLabels } from "./organization-participation";
const ja = {
  edit: "見る関係を編集", title: "見る関係の編集", applied: "適用中", unrestricted: "すべての関係（追加条件なし）",
  cancel: "キャンセル", draft: "編集中・未適用", unchanged: "適用中の条件と同じです。", apply: "適用",
  closeEditor: "条件編集を閉じる",
  roleEdit: "制作の役割を調整", noRole: "役割で絞らない", specifyRole: "役割を指定する",
  roleHelp: "選んだ役割の主張を表示します。否定する主張も含みます。役割未指定の主張は対象外です。",
  broadHelp: "役割を限定していない主張も含めて制作関与を辿ります。",
  noContribution: "制作の関係は表示されません。他に選んだ関係はそのまま辿れます。",
  none: "関係を表示しない", noRoles: "役割の選択なし・制作関与は表示しない",
  scope: "条件は探索全体に適用します。検索の候補は絞り込みません。",
  restart: "適用すると同じ起点から取得し直し、開閉状態をリセットします。キャンセルでは探索を変えません。",
  initialTitle: "対象から、つながりを辿ってみる", initialHelp: "検索欄の開始例を選ぶか、名前や別名を検索して始められます。関係の条件は後から調整できます。",
  selectedHelp: "対象をクリックして周囲を展開。線を選ぶと主張と出典を確認できます。",
  graphResize: "右下をドラッグして高さを調整",
  root: "探索の起点", rootEmpty: "未指定", detailWide: "詳細を広く読む", detailNormal: "詳細の幅を戻す",
  detailHelp: "Graphで対象や線を選ぶと、ここで内容と根拠を確認できます。",
};
export function entryLabels(locale = "ja") { const resources: Record<string, typeof ja> = { ja }; return resources[locale] ?? resources[locale.split("-")[0]] ?? ja; }
export function conditionSummary(predicates: PredicateFilter, roles: ContributionRoleFilter, locale = "ja", positions: OrganizationPositionFilter = null, eventRoles: EventRoleFilter = null) {
  const text = entryLabels(locale), relations = explorationLabels(locale), roleText = contributionLabels(locale);
  if (predicates === null && roles === null && positions === null && eventRoles === null) return text.unrestricted;
  if (predicates?.length === 0) return text.none;
  const facetText = relationFacetLabels(locale), facets = facetsForPredicates(predicates);
  const name = (predicate: typeof PREDICATE_KEYS[number]) => {
    const facet = RELATION_FACET_CATALOG.items.find(item => facets?.includes(item.id) && (item.predicates as readonly string[]).includes(predicate));
    return facet ? facetText.items[facet.id].name : relations.predicates[predicate];
  };
  const summary = (predicates ?? PREDICATE_KEYS).map((predicate) => predicate === "CONTRIBUTED_TO" && roles !== null
    ? `${name(predicate)}（${roles.length ? roles.map((role) => roleText.roles[role]).join("・") : text.noRoles}）`
    : predicate === "AFFILIATED_WITH" && positions !== null ? `${name(predicate)}（${positions.length ? positions.map(position => organizationParticipationLabels(locale).positions[position]).join("・") : organizationParticipationLabels(locale).empty}）` : predicate === "PARTICIPATED_IN" && eventRoles !== null ? `${name(predicate)}（${eventRoles.length ? eventRoles.map(role => eventParticipationLabels(locale).roles[role]).join("・") : eventParticipationLabels(locale).empty}）` : name(predicate)).join(" ／ ");
  return predicates !== null && facets === null ? `${facetText.customSummary}：${summary}` : summary;
}
