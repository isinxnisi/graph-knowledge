import type { DatasetMode } from "../domain/dataset";
const ja = {
  "public-kg": { searchExample: "例：PLUTO・ハイゼンベルク・ソルヴェイ", badge: "共通Knowledge Graph · 公開準備中", description: "資料で確認された人物・作品・組織・出来事の関係を辿ります。登録範囲は網羅的ではありません。", empty: "登録範囲では関係がありません。実世界の不存在を示しません。" },
  "pilot-event-v1": { searchExample: "例：ソルヴェイ・ローレンツ・ディラック", badge: "特定Event参加パイロット v1", description: "資料で確認した開催回への参加を辿ります。招待・全日程出席・全回参加を示しません。", empty: "今回の登録範囲では関係がありません。実世界の不存在を示しません。" },
  "pilot-science-v2": { searchExample: "例：ハイゼンベルク・ニールス・ボーア研究所", badge: "科学・研究機関パイロット v2", description: "資料で確認した関わりと立場を辿ります。同時在籍・面識・雇用形態を示しません。", empty: "今回の登録範囲では関係がありません。実世界の不存在を示しません。" },
  "pilot-science-v1": { searchExample: "例：ゲッティンゲン大学・パウリ", badge: "科学・研究機関パイロット v1", description: "資料で確認した人物と機関の関わりを辿ります。同時在籍・面識・共同研究を示しません。", empty: "今回の登録範囲では関係がありません。実世界の不存在を示しません。" },
  demo: { searchExample: "例：青葉ハル・星の航路", badge: "架空のデモデータ", description: "人物・作品・組織のつながりを、主張と出典から辿る。", empty: "関係は登録されていません（孤立Entity）。" },
  "pilot-urasawa-v1": { searchExample: "例：浦沢直樹・PLUTO", badge: "少数実データパイロット v1", description: "確認した資料の範囲だけを収録しています。網羅的ではありません。共通作品で繋がっていても、人物間の直接関係を示すものではありません。", empty: "今回の登録範囲では関係がありません。実世界での関係の有無を示すものではありません。" },
  "pilot-urasawa-v2": { searchExample: "例：長崎尚志・PLUTO", badge: "少数実データパイロット v2", description: "確認した資料の範囲を辿る少量の実データです。網羅的ではありません。", empty: "今回の登録範囲では関係がありません。実世界の不存在を示しません。" },
};
export function datasetLabels(mode: DatasetMode, locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return (resources[locale] ?? resources[locale.split("-")[0]] ?? ja)[mode];
}
