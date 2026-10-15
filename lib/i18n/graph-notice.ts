const ja = { restored: "探索を復元しました。", cached: "取得済みの枝を復元しました。", closed: "展開を閉じました。", previous: "直前の探索に戻りました。", conditions: "見る関係を変更しました。", fetching: "関係を再取得します。" };
const en: typeof ja = { restored: "Exploration restored.", cached: "Cached branch restored.", closed: "Branch closed.", previous: "Returned to previous exploration.", conditions: "Relation conditions updated.", fetching: "Refetching adjacent relations." };
export const graphNoticeLabels = (locale = "ja") => locale.startsWith("en") ? en : ja;
