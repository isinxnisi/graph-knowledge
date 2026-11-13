"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "./NavigationLink";
import { useRouter } from "next/navigation";
import ThemeTimeline from "./ThemeTimeline";
import { subsetThemeTimeline } from "../lib/domain/theme-timeline";
import {
  examineTemporalPattern,
  temporalPatterns,
  temporalPatternPackage,
  type TemporalPattern,
} from "../lib/domain/temporal-patterns";
import base from "./ThemeWorkbench.module.css";
import css from "./TemporalPatternLab.module.css";

const statusLabel = {
  renderable: "描画で確認",
  gap: "仕様の不足",
  rejected: "入力を拒否",
};
export default function TemporalPatternLab({ caseId }: { caseId: string }) {
  const router = useRouter();
  const pattern =
    temporalPatterns.find((p) => p.id === caseId) ?? temporalPatterns[0];
  return (
    <main className={base.shell}>
      <header className={css.top}>
        <Link href="/themes">← テーマ一覧</Link>
        <span>すべて仮想データ · 独立確認版</span>
      </header>
      <h1 className={css.heading}>年表の検証ケース</h1>
      <p className={css.intro}>
        入力できること、意味を保てること、読みやすく描けることを、別々に確認します。
      </p>
      <div className={css.picker}>
        <label>
          ケース
          <select
            value={pattern.id}
            onChange={(e) => {
              router.push(`/themes/patterns?case=${e.target.value}`);
            }}
          >
            {[...new Set(temporalPatterns.map((p) => p.category))].map(
              (category) => (
                <optgroup label={category} key={category}>
                  {temporalPatterns
                    .filter((p) => p.category === category)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                        {p.status === "gap" ? " · 仕様不足" : ""}
                      </option>
                    ))}
                </optgroup>
              ),
            )}
          </select>
        </label>
        <span className={css.steps}>
          {temporalPatterns.indexOf(pattern) + 1} / {temporalPatterns.length}
        </span>
        {temporalPatterns.indexOf(pattern) > 0 && (
          <Link
            href={`/themes/patterns?case=${temporalPatterns[temporalPatterns.indexOf(pattern) - 1].id}`}
          >
            ← 前
          </Link>
        )}
        {temporalPatterns.indexOf(pattern) < temporalPatterns.length - 1 && (
          <Link
            href={`/themes/patterns?case=${temporalPatterns[temporalPatterns.indexOf(pattern) + 1].id}`}
          >
            次 →
          </Link>
        )}
      </div>
      <Pattern key={pattern.id} pattern={pattern} />
      <details className={css.coverage}>
        <summary>確認範囲と未対応を見る</summary>
        <p>
          <a href="/theme-examples/temporal-patterns.json" download>
            全ケースのJSONを保存
          </a>
        </p>
        <p>
          有限の検証観点を整理したケース集です。すべての時間表現を網羅したという意味ではありません。「描画で確認」は入力可能という区分で、見やすさの受入済み判定ではありません。
        </p>
        <table>
          <thead>
            <tr>
              <th>観点</th>
              <th>件数</th>
              <th>ケース</th>
            </tr>
          </thead>
          <tbody>
            {[...new Set(temporalPatterns.map((p) => p.category))].map(
              (category) => (
                <tr key={category}>
                  <th>{category}</th>
                  <td>
                    {
                      temporalPatterns.filter((p) => p.category === category)
                        .length
                    }
                  </td>
                  <td>
                    {temporalPatterns
                      .filter((p) => p.category === category)
                      .map((p) => (
                        <Link key={p.id} href={`/themes/patterns?case=${p.id}`}>
                          {p.title}
                        </Link>
                      ))}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </details>
    </main>
  );
}
function Pattern({ pattern }: { pattern: TemporalPattern }) {
  const router = useRouter();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const examined = useMemo(() => examineTemporalPattern(pattern), [pattern]);
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState(examined.records.map((r) => r.id));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const consistent = examined.accepted === pattern.expectedAcceptance;
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [themeId, setThemeId] = useState(
    () => `pattern-${pattern.id}-${crypto.randomUUID().slice(0, 8)}`,
  );
  async function save() {
    setBusy(true);
    setError("");
    try {
      const input = temporalPatternPackage(pattern, themeId);
      input.records = input.records.filter((r) => selected.includes(r.id));
      input.timeline = subsetThemeTimeline(pattern.timeline, selected);
      const response = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", requestId, package: input }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "保存できませんでした");
      if (active.current) router.push(`/themes/${value.id}`);
    } catch (e) {
      if (active.current) {
        setError((e as Error).message);
        setBusy(false);
      }
    }
  }
  return (
    <>
      <section className={css.caseInfo} data-status={pattern.status}>
        <div className={css.title}>
          <h2>{pattern.title}</h2>
          <span>{statusLabel[pattern.status]}</span>
        </div>
        {pattern.expectation !== pattern.gap && <p>{pattern.expectation}</p>}
        {pattern.gap && <p className={css.gap}>現行の不足：{pattern.gap}</p>}
        {!consistent && (
          <p role="alert">
            期待した受理結果と現行実装が一致しません。このケースの検証が必要です。
          </p>
        )}
        <details>
          <summary>入力・意味・表示の確認点</summary>
          <ul>
            <li>
              入力：
              {examined.accepted
                ? "現在の共通入力形式で受理されます。"
                : "現在の共通入力形式では拒否されます。"}
            </li>
            <li>
              意味：仮想データの範囲・原表現を保持し、所属や因果を自動生成しません。
            </li>
            <li>
              表示：
              {pattern.status === "gap"
                ? "仕様不足を解決した表示ではありません。入力可能な場合は現行の表示を下に示します。"
                : "下の実際の年表で確認してください。"}
            </li>
            {pattern.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      </section>
      {examined.accepted ? (
        <ThemeTimeline
          selectionLabel="テーマに保存する"
          records={examined.records}
          entities={examined.entities}
          timeline={pattern.timeline}
          focusedRecordId={focus}
          onFocusRecord={setFocus}
          selectedRecordIds={selected}
          onToggleSelected={
            busy
              ? undefined
              : (id) => {
                  setSelected((s) =>
                    s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
                  );
                  setRequestId(crypto.randomUUID());
                  setThemeId(
                    `pattern-${pattern.id}-${crypto.randomUUID().slice(0, 8)}`,
                  );
                }
          }
        />
      ) : (
        <section className={css.rejection}>
          <h3>
            {pattern.status === "gap"
              ? "この表現の描画には、時間モデルの拡張が必要です"
              : "この入力は保存前に拒否されます"}
          </h3>
          <p>
            日付やラベルを置き換えた代用グラフは表示しません。元の入力は下のJSONで確認できます。
          </p>
          <details>
            <summary>現在の検証エラー</summary>
            <ul>
              {examined.issues.slice(0, 5).map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
      <div className={css.save}>
        <span>{selected.length}件を選択 · 閲覧だけではDBへ保存されません</span>
        <button
          data-primary
          disabled={
            busy ||
            !consistent ||
            pattern.status !== "renderable" ||
            !selected.length
          }
          onClick={() => void save()}
        >
          {busy ? "保存中…" : "選んだ記録をテーマに保存"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <details className={css.source}>
        <summary>原本の仮想データJSON</summary>
        <p>
          通常のパッケージ入力と同じ検証に通します。仮想の根拠欄は、このケースの定義を指しています。
        </p>
        <textarea
          aria-label="仮想ケースの原本JSON"
          readOnly
          value={JSON.stringify(examined.input, null, 2)}
        />
      </details>
    </>
  );
}
