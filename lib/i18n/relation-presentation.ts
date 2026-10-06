const ja = {
  title: "この関係の概要", claimsTitle: "個別の主張と根拠", mixed: "肯定・否定あり", denied: "否定のみ",
  role: "役割", position: "立場", unspecified: "指定なし", termDenied: "否定のみ", termMixed: "肯否あり",
  graphCategories: { CONTRIBUTED_TO: "制作", AFFILIATED_WITH: "組織", PARTICIPATED_IN: "参加" },
  qualificationHelp: "限定の読み方", graphScope: "この線は現在Graphに表示している主張をまとめたものです。",
  noRole: "この主張では制作の役割を指定していません。資料の記載は下の根拠で確認できます。",
  noPosition: "この主張では組織との関わりの立場を指定していません。資料の記載は下の根拠で確認できます。",
  noEventRole: "この主張では参加上の立場を指定していません。全ての立場で参加したという意味ではありません。",
  unspecifiedHelp: "「指定なし」はこの項目を限定しない主張です。全ての役割・立場を含む認定ではありません。",
  mixedHelp: "異なる限定や期間の主張を含み得ます。肯否の混在だけでは矛盾を判定しません。",
  unseenHelp: "現在の条件に合いますが、この線には含まれていません。未取得ページや閉じた展開の主張もあり得ます。",
  outsideHelp: "比較のために表示しています。現在のGraphへは追加しません。",
  reading: "各主張の限定・期間・根拠を確認できます。表示順は正しさや信頼度を表しません。",
  original: "資料の記載・この主張の確認範囲", metadata: "資料の書誌情報", evidence: "根拠を読む",
  loading: "関連主張を確認中…", partial: "関連主張の取得が完了していません。以下は取得できた範囲です。",
  graphClaims: (n: number) => `Graphに表示中の主張 ${n}件`, claimCount: (n: number) => `${n}件の主張`,
  counts: (affirmed: number, denied: number) => `肯定 ${affirmed}件 ／ 否定 ${denied}件`,
  moreTerms: (n: number) => `ほか${n}件`, jump: (n: number) => `主張 ${n}を読む`,
};
// 新しい表示文言を識別子や知識語彙へ混ぜない。翻訳はここへ追加する。
export function relationPresentationLabels(locale = "ja") {
  const resources: Record<string, typeof ja> = { ja };
  return resources[locale] ?? resources[locale.split("-")[0]] ?? ja;
}
