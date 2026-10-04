const ja = {
  roles: { SCRIPT_WRITING: "脚本", SUPERVISION: "監修", PRODUCING: "プロデュース", STORY_CO_CREATION: "ストーリー共同制作" },
  mixedLegend: "点線：肯否混在", roleTitle: "制作Role", volumeUnknown: "巻表記未確認", editionUnknown: "版名未確認", publicationOnly: "この刊行物の商品情報で確認されたクレジットです。この巻だけの担当や、全巻・全版・全期間の担当を示しません。", emptyRoles: "制作Roleは空集合", roleCount: (count: number) => `制作役割 ${count}種類`, moreRoles: (count: number) => ` ほか${count}役割`,
  title: "制作の役割", all: "制作関与すべて（役割限定なしを含む）", none: "役割の限定なし", scopeUnknown: "適用範囲が未構造化", mixed: "肯定・否定あり",
  help: "役割条件は制作関与だけに適用します。否定の主張も対象です。未指定の役割は補完しません。",
  partial: "Role表示は取得済みClaimの概要です。巻・版などの適用範囲は詳細で確認してください。",
  comparisonReference: "限定比較の参照",
  comparison: { same: "同じ限定の比較候補（期間・肯否は個別確認）", role: "Roleが異なる", scope: "scopeが異なる", unstructured: "適用範囲が未構造化のため限定の一致を判定しない" },
  evidence: "資料の原役割表記", language: "資料表記の言語", scope: "Claimの適用刊行物", broader: "広い主張と役割付き主張は別の意味です。同じSource由来でも独立した新資料の追加ではありません。",
};
export function contributionLabels(locale = "ja") { const resources: Record<string, typeof ja> = { ja }; return resources[locale] ?? resources[locale.split("-")[0]] ?? ja; }
