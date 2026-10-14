import type { DatasetMode } from "../domain/dataset";
const ja = {
  "public-kg": { searchExample: "例：PLUTO・ハイゼンベルク・ソルヴェイ", badge: "知識の地図 · 公開β", description: "資料で確認された人物・作品・組織・出来事の関係を辿ります。登録範囲は網羅的ではありません。", empty: "登録範囲では関係がありません。実世界の不存在を示しません。" },
  "pilot-event-v1": { searchExample: "例：ソルヴェイ・ローレンツ・ディラック", badge: "特定Event参加パイロット v1", description: "資料で確認した開催回への参加を辿ります。招待・全日程出席・全回参加を示しません。", empty: "今回の登録範囲では関係がありません。実世界の不存在を示しません。" },
  "pilot-science-v2": { searchExample: "例：ハイゼンベルク・ニールス・ボーア研究所", badge: "科学・研究機関パイロット v2", description: "資料で確認した関わりと立場を辿ります。同時在籍・面識・雇用形態を示しません。", empty: "今回の登録範囲では関係がありません。実世界の不存在を示しません。" },
  "pilot-science-v1": { searchExample: "例：ゲッティンゲン大学・パウリ", badge: "科学・研究機関パイロット v1", description: "資料で確認した人物と機関の関わりを辿ります。同時在籍・面識・共同研究を示しません。", empty: "今回の登録範囲では関係がありません。実世界の不存在を示しません。" },
  demo: { searchExample: "例：青葉ハル・星の航路", badge: "架空のデモデータ", description: "人物・作品・組織のつながりを、主張と出典から辿る。", empty: "関係は登録されていません（孤立Entity）。" },
  "pilot-urasawa-v1": { searchExample: "例：浦沢直樹・PLUTO", badge: "少数実データパイロット v1", description: "確認した資料の範囲だけを収録しています。網羅的ではありません。共通作品で繋がっていても、人物間の直接関係を示すものではありません。", empty: "今回の登録範囲では関係がありません。実世界での関係の有無を示すものではありません。" },
  "pilot-urasawa-v2": { searchExample: "例：長崎尚志・PLUTO", badge: "少数実データパイロット v2", description: "確認した資料の範囲を辿る少量の実データです。網羅的ではありません。", empty: "今回の登録範囲では関係がありません。実世界の不存在を示しません。" },
};
const en: typeof ja = {
  "public-kg": { searchExample: "e.g. PLUTO, Heisenberg, Solvay", badge: "Knowledge map · Public beta", description: "Explore documented relations between people, works, organizations and events. Coverage is not comprehensive.", empty: "No relations in the registered data. This does not imply absence in the real world." },
  "pilot-event-v1": { searchExample: "e.g. Solvay, Lorentz, Dirac", badge: "Specific event participation pilot v1", description: "Explore documented participation in a specific occurrence. Not invitations, attendance throughout, or the entire series.", empty: "No relations in this dataset. This does not imply absence in the real world." },
  "pilot-science-v2": { searchExample: "e.g. Heisenberg, Niels Bohr Institute", badge: "Science and research institutions pilot v2", description: "Explore documented involvement and positions. Not concurrent presence, acquaintance or employment type.", empty: "No relations in this dataset. This does not imply absence in the real world." },
  "pilot-science-v1": { searchExample: "e.g. Göttingen, Pauli", badge: "Science and research institutions pilot v1", description: "Explore documented involvement between people and institutions. Not concurrent presence, acquaintance or collaboration.", empty: "No relations in this dataset. This does not imply absence in the real world." },
  demo: { searchExample: "e.g. 青葉ハル, 星の航路", badge: "Fictional demo data", description: "Follow connections between people, works and organizations through claims and sources.", empty: "No relations registered (isolated entity)." },
  "pilot-urasawa-v1": { searchExample: "e.g. 浦沢直樹, PLUTO", badge: "Small real-data pilot v1", description: "Limited to verified sources; not comprehensive. A shared work does not establish a direct relation between its contributors.", empty: "No relations in this dataset. This does not determine whether they exist in the real world." },
  "pilot-urasawa-v2": { searchExample: "e.g. 長崎尚志, PLUTO", badge: "Small real-data pilot v2", description: "A small dataset limited to verified sources; not comprehensive.", empty: "No relations in this dataset. This does not imply absence in the real world." },
};
export function datasetLabels(mode: DatasetMode, locale = "ja") {
  const resources: Record<string, typeof ja> = { ja, en };
  return (resources[locale] ?? resources[locale.split("-")[0]] ?? ja)[mode];
}
