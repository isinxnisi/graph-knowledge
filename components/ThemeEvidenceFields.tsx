"use client";
import { useMemo, useState } from "react";
import type { ThemeEvidence, ThemeRecord } from "../lib/domain/theme-workbench";
import css from "./ThemeWorkbench.module.css";

type EvidenceInput = Omit<ThemeEvidence, "hash">;
type EvidenceRow = { key: string; value: EvidenceInput; open: boolean };
const clean = ({
  url,
  title,
  locator,
  excerpt,
  retrievedAt,
}: ThemeEvidence): EvidenceInput => ({
  url,
  title,
  locator,
  excerpt,
  retrievedAt,
});

/** Source reuse is an input convenience, not a claim that a source supports this record. */
export default function ThemeEvidenceFields({
  evidence,
  records,
  enteredAt,
  busy,
}: {
  evidence?: ThemeEvidence[];
  records: ThemeRecord[];
  enteredAt: string;
  busy: boolean;
}) {
  const blank = (): EvidenceRow => ({
    key: crypto.randomUUID(),
    open: true,
    value: {
      url: "",
      title: "",
      locator: "",
      excerpt: "",
      retrievedAt: enteredAt,
    },
  });
  const [rows, setRows] = useState<EvidenceRow[]>(() =>
    evidence?.length
      ? evidence.map((e, index) => ({
          key: crypto.randomUUID(),
          value: clean(e),
          open: index === 0,
        }))
      : [blank()],
  );
  const [removed, setRemoved] = useState<{
    row: EvidenceRow;
    index: number;
  } | null>(null);
  const sources = useMemo(() => {
    const unique = Array.from(new Map(
      records.flatMap((r) => r.evidence).map((e) => [
        JSON.stringify([e.url, e.title]), { url: e.url, title: e.title },
      ]),
    ).values());
    const groups = new Map<string, number>();
    const keys = unique.map((source) => JSON.stringify([
      source.title, new URL(source.url).hostname,
    ]));
    for (const key of keys) groups.set(key, (groups.get(key) ?? 0) + 1);
    return unique.map((source, index) => ({
      ...source,
      hint: groups.get(keys[index])! > 1 ? source.url : new URL(source.url).hostname,
    }));
  }, [records]);
  function change(key: string, values: Partial<EvidenceInput>) {
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, value: { ...row.value, ...values } } : row,
      ),
    );
  }
  return (
    <section aria-label="記録の根拠" className={css.form}>
      <div className={css.actions}>
        <strong>根拠 · {rows.length}件</strong>
      </div>
      {rows.map((row, index) => (
        <details
          key={row.key}
          open={row.open}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setRows((current) =>
              current.map((r) =>
                r.key === row.key && r.open !== open ? { ...r, open } : r,
              ),
            );
          }}
          onInvalid={(event) => {
            event.currentTarget.open = true;
          }}
        >
          <summary>
            根拠 {index + 1} · {row.value.title || "新しい資料"}
          </summary>
          <div className={css.form}>
            <input type="hidden" name="evidenceKey" value={row.key} />
            <input
              type="hidden"
              name={`evidence.${row.key}.retrievedAt`}
              value={row.value.retrievedAt}
            />
            {!!sources.length && (
              <label>
                このテーマの資料から選ぶ
                <select
                  aria-label={`根拠 ${index + 1} の資料を再利用`}
                  value=""
                  disabled={busy}
                  onChange={(event) => {
                    const source = sources[Number(event.target.value)];
                    if (source) change(row.key, { title: source.title, url: source.url });
                  }}
                >
                  <option value="" disabled>
                    資料名とURLを入力…
                  </option>
                  {sources.map((source, i) => (
                    <option key={JSON.stringify(source)} value={i}>
                      {source.title} — {source.hint}
                    </option>
                  ))}
                </select>
                <span className={css.caption}>
                  資料名とURLだけを使います。箇所・内容は、この記録について確認してください。
                </span>
              </label>
            )}
            <label>
              根拠URL
              <input
                required
                type="url"
                maxLength={2000}
                name={`evidence.${row.key}.url`}
                value={row.value.url}
                onChange={(e) => change(row.key, { url: e.target.value })}
              />
            </label>
            <div className={css.columns}>
              <label>
                資料名
                <input
                  required
                  maxLength={300}
                  name={`evidence.${row.key}.title`}
                  value={row.value.title}
                  onChange={(e) => change(row.key, { title: e.target.value })}
                />
              </label>
              <label>
                根拠の箇所
                <input
                  required
                  maxLength={1000}
                  name={`evidence.${row.key}.locator`}
                  placeholder="見出し、ページ、段落など"
                  value={row.value.locator}
                  onChange={(e) => change(row.key, { locator: e.target.value })}
                />
              </label>
            </div>
            <label>
              確認した内容・短い抜粋
              <textarea
                required
                maxLength={4000}
                name={`evidence.${row.key}.excerpt`}
                value={row.value.excerpt}
                onChange={(e) => change(row.key, { excerpt: e.target.value })}
              />
            </label>
            <div className={css.actions}>
              <button
                type="button"
                disabled={busy || rows.length === 1}
                aria-label={`根拠 ${index + 1} を外す`}
                onClick={() => {
                  setRemoved({ row, index });
                  setRows((current) =>
                    current.filter((r) => r.key !== row.key),
                  );
                }}
              >
                この根拠を外す
              </button>
            </div>
          </div>
        </details>
      ))}
      <div className={css.actions}>
        <button
          type="button"
          disabled={busy || rows.length >= 20}
          onClick={() => setRows((current) => [...current, blank()])}
        >
          ＋ 根拠を追加
        </button>
        {removed && (
          <button
            type="button"
            disabled={busy || rows.length >= 20}
            onClick={() => {
              setRows((current) => [
                ...current.slice(0, removed.index),
                removed.row,
                ...current.slice(removed.index),
              ]);
              setRemoved(null);
            }}
          >
            外した根拠を戻す
          </button>
        )}
        {rows.length >= 20 && (
          <span className={css.caption}>根拠は20件まで追加できます。</span>
        )}
      </div>
    </section>
  );
}
