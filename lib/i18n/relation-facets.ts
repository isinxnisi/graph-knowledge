import type { RelationFacetId } from "../client/relation-facets";

type Labels = {
  selectAllFacets: string; all: string; facets: string; custom: string; customSummary: string; help: string; replaceHelp: string; precise: string;
  items: Record<RelationFacetId, { name: string; description: string }>;
};
const ja: Labels = {
  selectAllFacets: "この3種類をすべて選択", all: "すべての関係", facets: "関係の種類から選ぶ", custom: "個別の関係を指定", customSummary: "個別指定",
  help: "選んだ種類のいずれかを辿ります。この3種類にはアシスタント・影響関係は含まれません。",
  replaceHelp: "種類から選ぶ場合は個別指定を置き換えます。対応する種類がない場合は、選択なしから始めます。",
  precise: "選んだ関係の追加条件",
  items: {
    "relation.work-production": { name: "作品制作への関与", description: "人物から作品への制作関与。役割は追加条件で指定できます。" },
    "relation.organization-involvement": { name: "人物と組織の関わり", description: "人物と組織の資料で確認された関わり。雇用や同時在籍を意味しません。" },
    "relation.event-participation": { name: "特定開催回への参加", description: "人物の特定Eventへの参加。招待のみは含みません。" },
  },
};
const en: Labels = {
  selectAllFacets: "Select all three types", all: "All relations", facets: "Choose relation types", custom: "Choose individual relations", customSummary: "Custom selection",
  help: "Follow any of the selected types. These three types do not include assistant or influence relations.",
  replaceHelp: "Choosing types replaces the individual selection. If it cannot be represented, start with no types selected.",
  precise: "Additional conditions for selected relations",
  items: {
    "relation.work-production": { name: "Work production involvement", description: "A person's involvement in producing a work. Roles can be specified separately." },
    "relation.organization-involvement": { name: "Person–organization involvement", description: "Documented involvement between a person and an organization; not necessarily employment or concurrent presence." },
    "relation.event-participation": { name: "Participation in a specific event", description: "A person's participation in a particular event occurrence; an invitation alone is excluded." },
  },
};
export function relationFacetLabels(locale = "ja"): Labels {
  const resources: Record<string, Labels> = { ja, en };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
