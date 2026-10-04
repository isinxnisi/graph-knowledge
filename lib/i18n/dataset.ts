import type { DatasetMode } from "../domain/dataset";
const ja = {
  demo: { searchExample: "例：青葉ハル・星の航路", badge: "架空のデモデータ", description: "人物・作品・組織のつながりを、主張と出典から辿る。", empty: "関係は登録されていません（孤立Entity）。" },
  "pilot-urasawa-v1": { searchExample: "例：浦沢直樹・PLUTO", badge: "少数実データパイロット v1", description: "確認した資料の範囲だけを収録しています。網羅的ではありません。共通作品で繋がっていても、人物間の直接関係を示すものではありません。", empty: "今回の登録範囲では関係がありません。実世界での関係の有無を示すものではありません。" },
  "pilot-urasawa-v2": { searchExample: "例：長崎尚志・PLUTO", badge: "少数実データパイロット v2", description: "確認した資料の範囲を辿る少量の実データです。網羅的ではありません。", empty: "今回の登録範囲では関係がありません。実世界の不存在を示しません。" },
};
export function datasetLabels(mode: DatasetMode, locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return (resources[locale] ?? resources[locale.split("-")[0]] ?? ja)[mode];
}
