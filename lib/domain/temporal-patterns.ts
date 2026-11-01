import {
  themePackageSchema,
  type ThemeRecord,
  type ThemeTimelineConfig,
} from "./theme-workbench";

type Input = {
  id: string;
  kind?: "relation" | "episode" | "note";
  label: string;
  time: unknown;
  subject?: string;
  object?: string;
  relation?: string;
};
export type TemporalPattern = {
  id: string;
  title: string;
  category: string;
  status: "renderable" | "gap" | "rejected";
  expectedAcceptance: boolean;
  expectation: string;
  checks: string[];
  gap?: string;
  records: Input[];
  timeline?: ThemeTimelineConfig;
  intervalPair?: { a: [number, number]; b: [number, number]; relation: string };
};
const calendar = (
  from: string,
  meaning: "point" | "duration" | "occurrence-window" = "point",
  to?: string,
  extra = {},
) => ({
  kind: "calendar",
  meaning,
  from,
  ...(to ? { to } : {}),
  label: "",
  ...extra,
});
const item = (
  id: string,
  time: unknown,
  label = `架空の記録${id.toUpperCase()}`,
): Input => ({ id, time, label });
const day = (n: number) => `2030-05-${String(n).padStart(2, "0")}`;
const span = (a: number, b: number, extra = {}) =>
  calendar(day(a), "duration", day(b), extra);
const point = (n: number) => calendar(day(n));
const cases: TemporalPattern[] = [];
function add(
  id: string,
  title: string,
  category: string,
  records: Input[],
  expectation: string,
  options: Partial<TemporalPattern> = {},
) {
  cases.push({
    id,
    title,
    category,
    records,
    expectation,
    checks: [],
    status: "renderable",
    expectedAcceptance: true,
    ...options,
  });
}

const pairs: [string, string, [number, number]][] = [
  ["before", "AがBより前", [12, 15]],
  ["after", "AがBより後", [1, 3]],
  ["meets", "Aの終了とBの開始が接する", [10, 15]],
  ["met-by", "Bの終了とAの開始が接する", [1, 4]],
  ["overlaps", "Aが先に始まり途中で重なる", [7, 13]],
  ["overlapped-by", "Bが先に始まり途中で重なる", [1, 7]],
  ["starts", "同じ開始・Aが先に終了", [4, 13]],
  ["started-by", "同じ開始・Bが先に終了", [4, 7]],
  ["during", "AがBの期間内に入る", [1, 13]],
  ["contains", "BがAの期間内に入る", [6, 8]],
  ["finishes", "同じ終了・Aが後から開始", [1, 10]],
  ["finished-by", "同じ終了・Bが後から開始", [7, 10]],
  ["equal", "開始も終了も同じ", [4, 10]],
];
for (const [relation, title, b] of pairs) {
  add(
    `pair-${relation}`,
    title,
    "期間同士の13関係",
    [
      item("a", span(4, 10), "架空の活動A"),
      item("b", span(...b), "架空の活動B"),
    ],
    "2本の期間の端と重なりを読み分けられる。時間上の包含を、意味上の所属にしない。",
    {
      intervalPair: { a: [4, 10], b, relation },
      checks: [
        "開始と終了の相対位置が入力と一致する",
        "両方の記録を独立して選び、根拠を開ける",
        "所属・因果の関係は自動生成されない",
      ],
    },
  );
}

add(
  "precision-year",
  "年だけ分かる時点",
  "精度の混在",
  [item("a", calendar("2030"))],
  "2030年のどこか。1月1日の出来事と断定しない。",
);
add(
  "precision-month",
  "月だけ分かる時点",
  "精度の混在",
  [item("a", calendar("2030-05"))],
  "5月のどこか。月初の確定した日付を補わない。",
);
add(
  "precision-day",
  "日まで分かる時点",
  "精度の混在",
  [item("a", point(8))],
  "その日を点で表す。時刻までは確定しない。",
);
add(
  "precision-mixed",
  "年・月・日が同じ年に混在",
  "精度の混在",
  [
    item("a", calendar("2030"), "年までの記録A"),
    item("b", calendar("2030-05"), "月までの記録B"),
    item("c", point(8), "日までの記録C"),
  ],
  "年単位の表示でも月日を失わず、年の記録を必ず月日の前と断定しない。",
);
add(
  "precision-reversed-looking",
  "月から同じ年の終端へ",
  "精度の混在",
  [item("a", calendar("2030-12", "duration", "2030"))],
  "文字列だけでは逆順に見える値も、可能範囲を考慮して受け付け、線の幅を負にしない。",
);
add(
  "same-day",
  "同日の時点・期間・発生幅",
  "精度の混在",
  [
    item("a", point(8), "その日の時点A"),
    item("b", span(8, 8), "同日の活動B"),
    item("c", calendar(day(8), "occurrence-window", day(8)), "同日内の出来事C"),
  ],
  "同じ日付でも時間の意味を同一視しない。日内の順番は補わない。",
);
add(
  "same-date-independent",
  "同じ日の別の出来事",
  "精度の混在",
  [item("a", point(8)), item("b", point(8)), item("c", point(8))],
  "同日の3件を独立して読める。登録順を実際の発生順にしない。",
);
add(
  "leap-and-year-crossing",
  "閏日・年をまたぐ期間",
  "精度の混在",
  [
    item("a", calendar("2024-02-29")),
    item("b", calendar("2024-12-31", "duration", "2025-01-01")),
  ],
  "閏日を受理し、年をまたぐ期間を逆転させない。",
);

add(
  "window-empty",
  "曖昧な発生幅の中に他の記録がない",
  "曖昧な発生時期",
  [item("a", calendar(day(4), "occurrence-window", day(10)))],
  "年・月表示では同じ単位内の点、日表示では4〜10日の候補幅になる。元の意味・範囲は変わらない。",
);
add(
  "window-with-event",
  "曖昧な発生幅の中に日付のある出来事",
  "曖昧な発生時期",
  [
    item("a", calendar(day(4), "occurrence-window", day(10))),
    item("b", point(7)),
  ],
  "AがBの前か後かは決まらないことを、範囲で読める。",
);
add(
  "window-event-at-boundary",
  "出来事が候補幅の端と同日",
  "曖昧な発生時期",
  [
    item("a", calendar(day(4), "occurrence-window", day(10))),
    item("b", point(4)),
    item("c", point(10)),
  ],
  "同じ日付の点・候補幅を、それぞれの見出しへつなぐ。上下の順を時間的な前後として扱わない。",
);
add(
  "windows-overlap",
  "二つの発生候補幅が重なる",
  "曖昧な発生時期",
  [
    item("a", calendar(day(4), "occurrence-window", day(10))),
    item("b", calendar(day(7), "occurrence-window", day(13))),
  ],
  "二つの出来事の発生順は未確定。期間の継続や所属と混同しない。",
);
add(
  "window-filtered-event",
  "比較相手を絞り込みで隠す",
  "曖昧な発生時期",
  [
    item("a", calendar(day(4), "occurrence-window", day(10))),
    item("b", point(7)),
  ],
  "表示対象が減っても元の時期情報を変更しない。全体を調べたという主張へ変えない。",
  {
    status: "gap",
    gap: "記録の表示除外は未実装。点と幅の切替は表示単位で決まり、比較相手の有無では変わりません。",
  },
);
add(
  "duration-empty",
  "途中に出来事がない継続期間",
  "曖昧な期間境界",
  [item("a", span(4, 10))],
  "比較相手がなくても、実際に続いた期間の意味を保持する。",
);
add(
  "boundary-start",
  "開始だけが曖昧",
  "曖昧な期間境界",
  [item("a", span(4, 15, { startLatest: day(7) })), item("b", point(6))],
  "開始候補4〜7日と、開始後の継続部分を分ける。",
);
add(
  "boundary-end",
  "終了だけが曖昧",
  "曖昧な期間境界",
  [item("a", span(4, 15, { endEarliest: day(12) })), item("b", point(13))],
  "終了候補12〜15日を、確実に継続している区間にしない。",
);
add(
  "boundaries-separate",
  "両端が曖昧・確かな中央部分あり",
  "曖昧な期間境界",
  [
    item("a", span(4, 15, { startLatest: day(7), endEarliest: day(12) })),
    item("b", point(9)),
  ],
  "開始候補・確かな中央部分・終了候補を読み分けられる。",
);
add(
  "boundaries-overlap",
  "両端の候補幅が交差する",
  "曖昧な期間境界",
  [
    item("a", span(4, 15, { startLatest: day(12), endEarliest: day(7) })),
    item("b", point(9)),
  ],
  "すべての候補に共通する継続区間を描かない。実際の開始≦終了という制約は保持する。",
);
add(
  "boundaries-mixed",
  "境界にも年・月・日が混在",
  "曖昧な期間境界",
  [
    item(
      "a",
      calendar("2030", "duration", "2032", {
        startLatest: "2031-05",
        endEarliest: "2031-12-10",
      }),
    ),
  ],
  "境界の精度を保ち、元の値を合成日付へ書き換えない。",
);

add(
  "membership-none",
  "同じ期間内でも所属は未登録",
  "所属と文脈",
  [
    item("a", span(4, 15), "架空の時代区分A"),
    item("b", point(8), "同時期の別対象B"),
  ],
  "Aの線の範囲内にBがあっても、BからAへの関係を生成しない。",
);
add(
  "membership-explicit",
  "根拠のある所属を別記録にする",
  "所属と文脈",
  [
    item("a", span(4, 15), "架空の時代区分A"),
    item("b", point(8), "時期内の対象B"),
    {
      id: "membership",
      label: "【架空】BはAに属すると仮定する",
      subject: "b",
      object: "a",
      relation: "属する（架空の仮定）",
      time: null,
    },
  ],
  "時期の配置と、明示した所属関係を独立した記録として保持する。",
);
add(
  "undated",
  "時期不明と日付のある記録",
  "所属と文脈",
  [item("a", null, "時期が不明な背景A"), item("b", point(8))],
  "時期不明へ便宜的な日付を入れず、背景として読める。",
);
add(
  "cycle",
  "10月から翌2月の周期",
  "所属と文脈",
  [
    item("a", {
      kind: "cycle",
      axis: "架空の季節",
      period: 12,
      from: 10,
      to: 2,
      wrap: true,
      unit: "月",
      label: "毎年の周期",
    }),
  ],
  "周期の折返しを暦日へ無理に変換しない。",
);
add(
  "qualitative",
  "日の出・日中などの定性軸",
  "所属と文脈",
  [
    item("a", {
      kind: "qualitative",
      axis: "架空の一日",
      from: "日の出",
      coordinateMeaning: "光の状態。固定した時刻ではない",
      label: "日の出",
    }),
    item("b", {
      kind: "qualitative",
      axis: "架空の一日",
      from: "日中",
      coordinateMeaning: "光の状態。固定した時刻ではない",
      label: "日中",
    }),
  ],
  "日の出を6時などの固定した時刻へ変換しない。",
);

const gap = (
  id: string,
  title: string,
  records: Input[],
  text: string,
  accepted = false,
) =>
  add(id, title, "仕様の不足", records, text, {
    status: "gap",
    expectedAcceptance: accepted,
    gap: text,
  });
gap(
  "hour",
  "時まで分かる出来事",
  [item("a", calendar("2030-05-08T09+09:00"))],
  "日付と時を同じ暦軸で扱う型は未実装。時刻を削って成功扱いにはしない。",
);
gap(
  "minute",
  "分まで分かる時刻",
  [item("a", calendar("2030-05-08T09:30+09:00"))],
  "分精度とタイムゾーンを保持する暦日型が必要。",
);
gap(
  "timezone",
  "同じ瞬間の異なるタイムゾーン",
  [
    item("a", calendar("2030-05-08T09:00+09:00")),
    item("b", calendar("2030-05-08T00:00Z")),
  ],
  "元の表記とゾーンを残し、同じ瞬間として比較する仕組みが必要。",
);
gap(
  "local-clock",
  "タイムゾーン不明の時刻",
  [item("a", calendar("2030-05-08T09:30"))],
  "ゾーン不明をUTCなどへ勝手に換算しない表現が必要。",
);
gap(
  "first-half-undefined",
  "定義のない「前期」",
  [item("a", calendar("2030前期"))],
  "前期を1〜6月と決め付けず、原表現と区切りの定義・根拠を扱う型が必要。",
);
gap(
  "first-half-label",
  "ラベルだけの「前期」",
  [item("a", calendar("2030", "point", undefined, { label: "2030年前期" }))],
  "文字として保存できても、計算上は年全体のまま。前期の意味を扱えたとは判定しない。",
  true,
);
add(
  "first-half-defined",
  "前期の範囲が明示されている場合",
  "精度の混在",
  [
    item(
      "a",
      calendar("2030-04-01", "occurrence-window", "2030-09-30", {
        label: "架空制度の2030年前期（4〜9月と明示）",
      }),
    ),
    item("b", calendar("2030-06-10")),
  ],
  "区切りを明示した範囲として入力する。前期という語だけから範囲を推測しない。",
);
gap(
  "relative-stage",
  "ある時代の前期・後期",
  [
    item("a", {
      kind: "calendar",
      from: { relativeTo: "era-a", part: "early" },
      meaning: "point",
      label: "架空時代Aの前期",
    }),
  ],
  "親の時代区分を参照し、境界が未確定でも区分の意味を失わない構造は未実装。",
);
gap(
  "multiple-windows",
  "複数の離れた発生候補",
  [
    item("a", {
      kind: "calendar",
      meaning: "occurrence-window",
      from: day(4),
      to: day(15),
      alternatives: [
        [day(4), day(5)],
        [day(14), day(15)],
      ],
      label: "4〜5日または14〜15日",
    }),
  ],
  "間の6〜13日を候補に加えない複数範囲の型は未実装。",
);

for (const [id, title, time] of [
  ["invalid-date", "存在しない日付", calendar("2030-02-30")],
  ["invalid-reverse", "逆転した期間", span(15, 4)],
  ["invalid-missing-end", "終了のない継続期間", calendar(day(4), "duration")],
  [
    "invalid-start-boundary",
    "開始候補の最遅が最早より前",
    span(4, 15, { startLatest: day(3) }),
  ],
  [
    "invalid-end-boundary",
    "終了候補の最早が最遅より後",
    span(4, 15, { endEarliest: day(16) }),
  ],
  [
    "invalid-window-boundary",
    "発生幅に期間用の境界を指定",
    calendar(day(4), "occurrence-window", day(15), { startLatest: day(7) }),
  ],
  [
    "invalid-point-end",
    "時点に継続期間の終端を指定",
    calendar(day(4), "point", day(15)),
  ],
] as const)
  add(
    id,
    title,
    "入力の拒否",
    [item("a", time)],
    "入力を拒否し、元の内容や既存テーマを変更しない。",
    { status: "rejected", expectedAcceptance: false },
  );

add(
  "explicit-inset",
  "明示した子軸を行の中で開く",
  "所属と文脈",
  [
    item("a", point(8), "架空の一日A"),
    item("b", {
      kind: "qualitative",
      axis: "架空の一日",
      from: "日の出",
      coordinateMeaning: "固定時刻ではない一日の段階",
      label: "日の出の記録B",
    }),
  ],
  "Aを開いたときだけ、明示した別軸Bを表示する。日付が近いから自動的に入れ子にしない。",
  {
    timeline: {
      version: 1,
      axes: [
        { id: "calendar", kind: "calendar", label: "架空の日付" },
        {
          id: "day",
          kind: "qualitative",
          label: "一日の段階",
          originLabel:
            "この仮想例は2030-05-08の一日。固定した時刻へ換算しない。",
          order: ["日の出", "日中", "日没"],
        },
      ],
      placements: [
        { recordId: "a", axisId: "calendar" },
        { recordId: "b", axisId: "day" },
      ],
      insets: [{ parentRecordId: "a", axisId: "day", label: "Aの日の流れ" }],
    },
  },
);
add(
  "dense-overlap",
  "同時期の12本の期間",
  "前後と重なりの負荷",
  Array.from({ length: 12 }, (_, i) =>
    item(`p${i + 1}`, span(4, 15), `架空の並行活動${i + 1}`),
  ),
  "同じ端の期間を統合せず、全12記録を独立して選べる。狭い画面の年表内スクロールも確認する。",
);
add(
  "display-granularity",
  "年・月・日を切り替えて読む",
  "表示単位と接続先",
  [
    item("a", calendar("2030")),
    item("b", calendar("2030-05")),
    item("c", point(8)),
  ],
  "表示を年・月・日に変えても、保存した精度と原表現は変わらない。暦日時刻の対応とは別の機能。",
);
add(
  "year-point-and-window",
  "1991年の出来事と、1991年のどこか",
  "表示単位と接続先",
  [
    item("a", calendar("1991"), "1991年の記録A"),
    item(
      "b",
      calendar("1991", "occurrence-window", "1991"),
      "1991年のどこかの記録B",
    ),
  ],
  "自動の年表示ではどちらも1991年の点。日表示では年内の幅を示す。各点は自分の見出しへつながる。",
);
add(
  "month-window-and-duration",
  "同じ月内の発生幅と、続いた期間",
  "表示単位と接続先",
  [
    item("a", calendar(day(4), "occurrence-window", day(10))),
    item("b", span(4, 10)),
  ],
  "月表示ではAは丸い点、Bは短い両端付きの期間線。日表示でそれぞれの幅へ戻り、元の意味を保つ。",
);
add(
  "shared-start-anchors",
  "期間の開始日と複数の出来事が重なる",
  "表示単位と接続先",
  [
    item("a", span(4, 15, { startLatest: day(7) })),
    item("b", point(4)),
    item("c", point(4)),
    item("d", point(15)),
  ],
  "期間・B・Cの接続先を混同しない。どの行を開いても接続を保つ。終了側もAだけへ戻り、行順は意味にしない。",
);
add(
  "year-crossing-window",
  "年をまたぐ発生候補幅",
  "表示単位と接続先",
  [item("a", calendar("1991-12-20", "occurrence-window", "1992-01-10"))],
  "年表示でも1991〜1992の幅を保つ。比較相手がないという理由だけで点にはしない。",
);

add(
  "record-context",
  "関係・エピソード・説明の対応",
  "表示単位と接続先",
  [
    {
      ...item("a", point(8), "ある作者が作品を制作した"),
      subject: "artist",
      object: "work",
      relation: "制作した",
    },
    {
      ...item(
        "b",
        calendar("2030", "duration", "2032", { label: "架空の青の時代" }),
        "ある作者の作風の時期区分",
      ),
      kind: "note",
      subject: "artist",
    },
    {
      ...item("c", point(10), "ある作者についてのエピソード"),
      subject: "artist",
    },
  ],
  "Aだけが二者を結ぶ関係。Bの期間名からEntityや所属の辺を自動生成しない。B・Cは年表・記録に残り、関係図へ自動で注記を出さない。",
);

const categoryOrder = [...new Set(cases.map((c) => c.category))];
export const temporalPatterns: readonly TemporalPattern[] = cases.toSorted(
  (a, b) =>
    categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category),
);
export function temporalPatternPackage(
  pattern: TemporalPattern,
  id = `pattern-${pattern.id}`,
) {
  const entities = [
    ...new Set(
      pattern.records.flatMap((r) => [
        r.subject ?? r.id,
        ...(r.object ? [r.object] : []),
      ]),
    ),
  ].map((id) => ({
    id,
    name: `架空の対象${id.toUpperCase()}`,
    kind: "仮想データ",
    description: "検証用。実在の人物・出来事ではありません。",
  }));
  return {
    schemaVersion: 1,
    id,
    title: `【仮想】${pattern.title}`,
    description: `すべて架空の検証データ。${pattern.expectation}`,
    entities,
    records: pattern.records.map((r) => ({
      id: r.id,
      kind: r.kind ?? (r.object ? "relation" : "episode"),
      subject: r.subject ?? r.id,
      object: r.object ?? null,
      assertion: `【仮想】${r.label}`,
      relation: r.relation ?? "",
      scope: "検証用の仮定。史実や実資料ではない。",
      polarity: "affirmed",
      time: r.time,
      evidence: [
        {
          url: `http://localhost:3276/themes/patterns?case=${pattern.id}`,
          title: "仮想ケースの定義",
          locator: `${pattern.id} / ${r.id}`,
          excerpt: pattern.expectation,
          retrievedAt: "2026-11-01T00:00:00Z",
        },
      ],
    })),
    ...(pattern.timeline ? { timeline: pattern.timeline } : {}),
    mappings: [],
  };
}
export function examineTemporalPattern(pattern: TemporalPattern) {
  const input = temporalPatternPackage(pattern);
  const result = themePackageSchema.safeParse(input);
  return {
    input,
    accepted: result.success,
    records: result.success
      ? (result.data.records.map((r) => ({
          ...r,
          revision: 1,
          updatedAt: "2026-11-01T00:00:00Z",
          reason: "仮想ケースの定義",
          mapping: null,
        })) as ThemeRecord[])
      : [],
    entities: result.success ? result.data.entities : [],
    issues: result.success
      ? []
      : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}
