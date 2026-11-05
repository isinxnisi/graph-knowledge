"use client";
import ExternalSourceLink from "./ExternalSourceLink";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import CapsuleStudio from "./CapsuleStudio";
import ThemeTimeline from "./ThemeTimeline";
import ThemeTimeFields from "./ThemeTimeFields";
import ThemeEvidenceFields from "./ThemeEvidenceFields";
import { themeTimeLabel } from "../lib/domain/theme-time";
import type { Selection } from "../lib/client/graph-state";
import { CapsuleModal } from "./CapsuleSurface";
import type { LocalCapsule } from "../lib/client/local-capsules";
import {
  themePackageSchema,
  themeTimeSchema,
  themeRecordSearchText,
  type ThemeDetail,
  type ThemeSummary,
  type ThemeCapsule,
  type ThemeCapsuleSummary,
  type ThemeCapsuleDiff,
  type ThemeRecord,
  type ThemeSearchHit,
  type ThemePackage,
  type ThemeEntity,
  type ThemeConcept,
} from "../lib/domain/theme-workbench";
import css from "./ThemeWorkbench.module.css";

async function api(query = "", body?: unknown) {
  const res = await fetch(
    "/api/themes" + query,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "操作を完了できませんでした");
  return data;
}
function local(c: ThemeCapsule): LocalCapsule {
  return {
    id: c.id,
    dataset: "public-kg",
    title: c.title,
    note: c.description,
    revision: c.revision,
    createdAt: c.createdAt,
    ...(c.revision > 1 ? { updatedAt: c.updatedAt } : {}),
    language: "ja",
    entityIds: [],
    claimIds: [],
    document: c.document,
  };
}
// New projections have no authored viewport yet. Fit their width on small screens;
// once a user saves a view, preserve that authored framing instead.
function initialView(c: LocalCapsule): LocalCapsule {
  if (
    typeof window === "undefined" ||
    !c.document ||
    c.document.layout.viewport
  )
    return c;
  const points = Object.values(c.document.layout.positions);
  const width = points.length
    ? Math.max(...points.map((p) => p.x)) -
      Math.min(...points.map((p) => p.x)) +
      460
    : 850;
  const height = points.length
    ? Math.max(...points.map((p) => p.y)) -
      Math.min(...points.map((p) => p.y)) +
      160
    : 560;
  const zoom = Math.max(
    0.15,
    Math.min(
      c.document.layout.zoom,
      (Math.min(window.innerWidth, 1440) - 90) / width,
      Math.max(240, Math.min(840, window.innerHeight - 180) - 190) / height,
    ),
  );
  return {
    ...c,
    document: { ...c.document, layout: { ...c.document.layout, zoom } },
  };
}
function timeLabel(r: ThemeRecord) {
  return themeTimeLabel(r.time);
}

function EmptyRelationshipGraph({
  onTimeline,
  onCreate,
}: {
  onTimeline: () => void;
  onCreate?: () => void;
}) {
  return (
    <section className={css.emptyGraph} aria-label="関係図に表示する内容なし">
      <Icon name="graph" />
      <h3>この図には、対象間の関係がありません</h3>
      <p>説明やエピソードは、年表と記録の中で読めます。</p>
      <div className={css.actions}>
        <button onClick={onTimeline}>年表で読む</button>
        {onCreate && <button onClick={onCreate}>関係図を作る</button>}
      </div>
    </section>
  );
}

function Evidence({ record }: { record: ThemeRecord }) {
  return (
    <>
      <p>{record.assertion}</p>
      {record.scope && <p>範囲：{record.scope}</p>}
      <p>
        {timeLabel(record)} ·{" "}
        {record.polarity === "affirmed"
          ? "肯定"
          : record.polarity === "denied"
            ? "否定"
            : "推測・不確実"}
      </p>
      {record.evidence.map((e, i) => (
        <div className={css.evidence} key={i}>
          <ExternalSourceLink href={e.url} label={e.title}/>
          <p>{e.locator}</p>
          <p>{e.excerpt}</p>
        </div>
      ))}
    </>
  );
}

function RecordChanges({
  change,
  entities,
}: {
  change: ThemeCapsuleDiff[number];
  entities: ThemeEntity[];
}) {
  const entityName = (id: string | null) => {
    if (!id) return "なし";
    const entity = entities.find((e) => e.id === id);
    return entity ? `${entity.name}（${id}）` : id;
  };
  const describeTime = (r: ThemeRecord) => {
    const t = r.time;
    if (!t) return "時期の記載なし";
    if (t.kind === "calendar") return timeLabel(r);
    if (t.kind === "cycle")
      return `${t.label}\n軸：${t.axis}\n周期：${t.period} ${t.unit}\n座標：${t.from} → ${t.to}\n折り返し：${t.wrap ? "あり" : "なし"}`;
    return `${t.label}\n軸：${t.axis}\n座標：${t.from}${t.to ? " → " + t.to : ""}\n座標の意味：${t.coordinateMeaning}`;
  };
  const fields: { label: string; value: (r: ThemeRecord) => string }[] = [
    {
      label: "種類",
      value: (r) =>
        ({ relation: "関係", episode: "エピソード", note: "説明・情報" })[
          r.kind
        ],
    },
    { label: "主語・対象", value: (r) => entityName(r.subject) },
    { label: "相手", value: (r) => entityName(r.object) },
    { label: "関係の言葉", value: (r) => r.relation },
    { label: "具体的な内容", value: (r) => r.assertion },
    { label: "範囲", value: (r) => r.scope },
    {
      label: "肯否・確かさ",
      value: (r) =>
        ({ affirmed: "肯定", denied: "否定", uncertain: "推測・不確実" })[
          r.polarity
        ],
    },
    { label: "時期", value: describeTime },
    {
      label: "根拠",
      value: (r) =>
        r.evidence
          .map(
            (e, i) =>
              `${i + 1}. ${e.title}\n${e.url}\n箇所：${e.locator}\n確認内容：${e.excerpt}\n確認日時：${e.retrievedAt}`,
          )
          .join("\n\n"),
    },
    {
      label: "意味の定義",
      value: (r) =>
        r.mapping?.concept
          ? `${r.mapping.concept.label}\n${r.mapping.concept.definition}\nID：${r.mapping.concept.id}`
          : "意味未整理",
    },
    { label: "意味対応の理由", value: (r) => r.mapping?.reason ?? "" },
    { label: "記録の訂正理由", value: (r) => r.reason },
  ];
  const changed = fields.flatMap((field) => {
    const before = field.value(change.before);
    const after = change.after ? field.value(change.after) : "記録がありません";
    return before === after ? [] : [{ label: field.label, before, after }];
  });
  return (
    <details className={css.changeDetails}>
      <summary>
        変更箇所を確認
        {changed.length
          ? ` · ${changed.map((f) => f.label).join("、")}`
          : " · 内容は同じで版だけが更新されています"}
      </summary>
      {changed.map((field) => (
        <section key={field.label}>
          <h3>{field.label}</h3>
          <div className={css.diff}>
            <div>
              <span className={css.caption}>保存時</span>
              <p>{field.before || "記載なし"}</p>
            </div>
            <div>
              <span className={css.caption}>現在</span>
              <p>{field.after || "記載なし"}</p>
            </div>
          </div>
        </section>
      ))}
    </details>
  );
}

export default function ThemeWorkbench({
  themeId,
  capId,
  shareToken,
}: {
  themeId?: string;
  capId?: string;
  shareToken?: string;
}) {
  const router = useRouter();
  const [themes, setThemes] = useState<ThemeSummary[]>([]),
    [caps, setCaps] = useState<ThemeCapsuleSummary[]>([]),
    [theme, setTheme] = useState<ThemeDetail | null>(null),
    [cap, setCap] = useState<ThemeCapsule | null>(null),
    [diff, setDiff] = useState<ThemeCapsuleDiff>([]),
    [themeRevision, setThemeRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [concept, setConcept] = useState(""),
    [hits, setHits] = useState<ThemeSearchHit[] | null>(null);
  const [tab, setTab] = useState("graph"),
    [selected, setSelected] = useState<string[]>([]),
    [record, setRecord] = useState<ThemeRecord | null>(null),
    [modal, setModal] = useState<"import" | "record" | "mapping" | null>(null),
    [json, setJson] = useState(""),
    [preview, setPreview] = useState<ThemePackage | null>(null),
    [generation, setGeneration] = useState(0),
    [graph, setGraph] = useState<LocalCapsule | null>(null),
    [shareUrl, setShareUrl] = useState("");
  const [catalog, setCatalog] = useState<ThemeConcept[]>([]);
  const [studioEditing, setStudioEditing] = useState(false);
  const [createEmptyGraph, setCreateEmptyGraph] = useState(false);
  const [graphCleanup, setGraphCleanup] = useState<{
    removedTexts: number;
    cleanedDescriptions: number;
  } | null>(null);
  const initialTabFor = useRef("");
  const onStudioEditingChange = useCallback((editing: boolean) => {
    setStudioEditing(editing);
    if (!editing) setCreateEmptyGraph(false);
  }, []);
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);
  const [recordKeys, setRecordKeys] = useState<Record<string, string>>({});
  const focusRecord = (theme?.records ?? cap?.snapshot.records ?? []).find(
    (r) => r.id === focusedRecordId,
  );
  const graphFocus = useMemo<Selection>(
    () =>
      focusRecord &&
      recordKeys[focusRecord.id] &&
      (focusRecord.kind === "relation"
        ? (cap?.document ?? graph?.document)?.relations
        : (cap?.document ?? graph?.document)?.texts
      )?.some((item) => item.key === recordKeys[focusRecord.id])
        ? {
            kind: focusRecord.kind === "relation" ? "relation" : "entity",
            id: recordKeys[focusRecord.id],
          }
        : null,
    [focusRecord, recordKeys, cap?.document, graph?.document],
  );
  function focusGraphKey(key: string) {
    const id = Object.entries(recordKeys).find(
      ([, value]) => value === key,
    )?.[0];
    if (id) setFocusedRecordId(id);
  }
  function toggleRecord(id: string) {
    setSelected((a) =>
      a.includes(id) ? a.filter((i) => i !== id) : [...a, id],
    );
  }
  function showRecordInGraph(record: ThemeRecord) {
    setFocusedRecordId(record.id);
    setTab("both");
  }

  const meaningIds = useRef(new Map<string, string>());
  const pendingRequest = useRef<{ signature: string; id: string } | null>(null);
  const [updates, setUpdates] = useState<string[]>([]);
  const load = useCallback(() => {
    const query = shareToken
      ? "?shared=" + encodeURIComponent(shareToken)
      : capId
        ? "?capsule=" + encodeURIComponent(capId)
        : themeId
          ? "?theme=" + encodeURIComponent(themeId)
          : "";
    return api(query)
      .then((d) => {
        const navigation = shareToken
          ? `shared:${shareToken}`
          : capId
            ? `capsule:${capId}`
            : themeId
              ? `theme:${themeId}`
              : "";
        if (navigation && initialTabFor.current !== navigation) {
          initialTabFor.current = navigation;
          const document = shareToken
            ? d.document
            : capId
              ? d.capsule.document
              : null;
          const hasGraph = document
            ? document.nodes.length +
                document.relations.length +
                document.texts.length >
              0
            : d.records.some((r: ThemeRecord) => r.kind === "relation");
          setTab(hasGraph ? "graph" : "time");
        }
        if (shareToken) {
          setCap(d);
          setRecordKeys(d.recordKeys ?? {});
        } else if (capId) {
          setCap(d.capsule);
          setGraphCleanup(d.graphCleanup ?? null);
          setRecordKeys(d.recordKeys ?? {});
          setDiff(d.diff);
          setThemeRevision(d.themeRevision);
          setUpdates(d.diff.map((x: { recordId: string }) => x.recordId));
        } else if (themeId) {
          setTheme(d);
          setCatalog(d.meaningCatalog ?? []);
          setSelected((old) =>
            old.length ? old : d.records.map((r: ThemeRecord) => r.id),
          );
        } else {
          setThemes(d.themes);
          setCaps(d.capsules);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [themeId, capId, shareToken]);
  useEffect(() => {
    void load();
  }, [load]); // IDs are navigation boundaries.
  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const signature = JSON.stringify(body);
      if (pendingRequest.current?.signature !== signature)
        pendingRequest.current = { signature, id: crypto.randomUUID() };
      const value = await api("", {
        requestId: pendingRequest.current.id,
        ...body,
      });
      pendingRequest.current = null;
      return value;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function submit(
    body: Record<string, unknown>,
    done?: (v: unknown) => void,
  ) {
    try {
      const v = await run(body);
      done?.(v);
    } catch {
      /* input remains open */
    }
  }
  async function makeCapsule() {
    if (!theme) return;
    await submit(
      {
        action: "capsule-create",
        themeRevision: theme.revision,
        themeId: theme.id,
        recordIds: selected,
      },
      (v) => {
        router.push("/themes/capsules/" + (v as ThemeCapsule).id);
      },
    );
  }
  const shown =
    theme?.records.filter(
      (r) =>
        (!concept || r.mapping?.concept?.id === concept) &&
        (!query ||
          themeRecordSearchText(r, theme.entities).includes(
            query.normalize("NFKC").toLocaleLowerCase(),
          )),
    ) ?? [];
  const concepts = [
    ...new Map([
      ...catalog.map((c) => [c.id, c] as const),
      ...(theme?.records ?? []).flatMap((r) =>
        r.mapping?.concept
          ? [[r.mapping.concept.id, r.mapping.concept] as const]
          : [],
      ),
    ]).values(),
  ];
  useEffect(() => {
    if (!theme) return;
    let active = true;
    void fetch("/api/themes/graph?theme=" + encodeURIComponent(theme.id))
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        if (active) {
          if (d.revision === theme.revision) {
            setGraph(d);
            setRecordKeys(d.recordKeys ?? {});
          } else
            setError(
              "テーマに新しい変更があります。「最新を読む」で確認してください。",
            );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [theme]);
  return (
    <main
      className={css.shell}
      onClickCapture={(event) => {
        const link =
          event.target instanceof Element ? event.target.closest("a") : null;
        if (studioEditing && link && link.target !== "_blank") {
          event.preventDefault();
          setMessage("編集中です。保存または破棄してから移動してください。");
        }
      }}
    >
      <header className={css.topbar}>
        <Link className={css.brand} href="/themes">
          <Icon name="graph" /> Plunode
        </Link>
        <span className={css.eyebrow}>テーマ・独立確認版</span>
        <div className={css.actions}>
          {!themeId && !capId && !shareToken && (
            <>
              <Link href="/themes/records" className={css.button}>共通の記録</Link>
              <button
                onClick={() => {
                  setRecord(null);
                  setModal("record");
                }}
              >
                ＋ テーマを作る
              </button>
              <button onClick={() => setModal("import")}>
                資料から取り込む
              </button>
            </>
          )}
          <button
            disabled={busy || studioEditing}
            onClick={() => {
              setError("");
              void load().then(() => setGeneration((g) => g + 1));
            }}
          >
            ↻ 最新を読む
          </button>
        </div>
      </header>
      {error && (
        <div role="alert" className={`${css.status} ${css.error}`}>
          {error}
        </div>
      )}
      {message && (
        <div role="status" className={css.status}>
          {message}
        </div>
      )}
      {loading && (
        <p role="status" className={css.empty}>
          保存した内容を読み込んでいます…
        </p>
      )}
      {!loading && !theme && !cap && !themeId && !capId && !shareToken && (
        <>
          <section className={css.intro}>
            <h1>根拠から、ひとつのテーマへ。</h1>
            <p>
              具体的な言葉のまま関係を残す。図から読み、気になるつながりを自分のCapsuleへ。
            </p>
          </section>
          <form
            className={css.filters}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                setHits(await api("?q=" + encodeURIComponent(query)));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label className={css.search}>
              <span>⌕</span>
              <input
                aria-label="すべてのテーマから検索"
                placeholder="対象・関係の言葉で探す"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button>検索</button>
            {hits && (
              <button
                type="button"
                onClick={() => {
                  setHits(null);
                  setQuery("");
                }}
              >
                解除
              </button>
            )}
          </form>
          {hits && (
            <section>
              <h2 className={css.sectionTitle}>本文に一致 · {hits.length}件</h2>
              {hits.map((h) => (
                <article className={css.card} key={h.themeId + h.record.id}>
                  <Link href={"/themes/" + h.themeId}>
                    {h.record.assertion}
                  </Link>
                  <p>{h.themeTitle}</p>
                </article>
              ))}
            </section>
          )}
          <h2 className={css.sectionTitle}>テーマ</h2>
          <div className={css.grid}>
            {themes.map((t) => (
              <article className={css.card} key={t.id}>
                <h2>{t.title}</h2>
                <p>{t.description}</p>
                <div className={css.meta}>
                  <span>{t.recordCount}件の記録</span>
                  <span>
                    更新 {new Date(t.updatedAt).toLocaleDateString("ja")}
                  </span>
                </div>
                <Link className={css.button} href={"/themes/" + t.id}>
                  テーマを読む →
                </Link>
              </article>
            ))}
          </div>
          {!themes.length && (
            <p className={css.empty}>
              最初のテーマを作るか、根拠パッケージを取り込んでください。
            </p>
          )}
          <details className={css.updates}>
            <summary>入力例から試す</summary>
            <p>
              <Link href="/themes/patterns">年表の仮想ケースを確認 →</Link>
            </p>
            <p className={css.caption}>
              資料を読み、主張と根拠箇所を整理した入力例です。内容を確認してから取り込みます。
            </p>
            {[
              ["ada", "解析機関と翻訳"],
              ["webb", "Webbと国際協力"],
              ["webb-timeline", "Webbの展開年表"],
              ["picasso-blue-period", "青の時代と同時期の作品"],
              ["temporal-boundaries-example", "曖昧な期間境界（架空の操作例）"],
            ].map(([n, title]) => (
              <button
                key={n}
                onClick={async () => {
                  const r = await fetch("/theme-examples/" + n + ".json");
                  setJson(JSON.stringify(await r.json(), null, 2));
                  setPreview(null);
                  setModal("import");
                }}
              >
                {title}
                を確認
              </button>
            ))}
          </details>
          <h2 className={css.sectionTitle}>保存したCapsule</h2>
          <div className={css.savedList}>
            {caps.map((c) => (
              <Link key={c.id} href={"/themes/capsules/" + c.id}>
                ◇ {c.title} <small>保存版 {c.revision}</small>
              </Link>
            ))}
          </div>
        </>
      )}
      {theme && (
        <>
          <section className={css.heading}>
            <Link className={css.back} href="/themes">
              ← テーマ一覧
            </Link>
            <h1>{theme.title}</h1>
            <p>{theme.description}</p>
            <div className={css.actions}>
              <button
                onClick={() => {
                  setRecord(null);
                  setModal("record");
                }}
              >
                ＋ 記録を加える
              </button>
              <button
                data-primary
                disabled={busy || !selected.length}
                onClick={() => void makeCapsule()}
              >
                選択した{selected.length}件をCapsuleへ
              </button>
            </div>
          </section>
          <div className={css.toolbar}>
            <div className={css.tabs}>
              {[
                ["graph", "関係図"],
                ["time", "年表"],
                ["both", "並べて読む"],
                ["list", "記録と根拠"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "list" && (
              <div className={css.filters}>
                <input
                  aria-label="テーマの本文検索"
                  placeholder="名前・関係・本文で絞り込む"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setTab("list");
                  }}
                />
                <select
                  aria-label="整理済みの意味"
                  value={concept}
                  onChange={(e) => {
                    setConcept(e.target.value);
                    setTab("list");
                  }}
                >
                  <option value="">すべての意味</option>
                  {concepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {tab === "list" && (
            <p className={css.caption}>
              {shown.length} / {theme.records.length}件 · 意味未整理{" "}
              {theme.records.filter((r) => !r.mapping?.concept).length}
              件。意味条件は対応を確認した記録だけを表示します。
            </p>
          )}
          <div
            className={css.visualWorkspace}
            data-mode={tab}
            hidden={tab === "list"}
          >
            <div className={css.graphPane} hidden={tab === "time"}>
              {(!graph || graph.revision !== theme.revision) && (
                <p role="status">この内容版の図を準備しています…</p>
              )}
              {graph &&
                graph.revision === theme.revision &&
                !graph.document?.nodes.length &&
                !graph.document?.texts.length && (
                  <EmptyRelationshipGraph onTimeline={() => setTab("time")} />
                )}
              {graph &&
                graph.revision === theme.revision &&
                !!(
                  graph.document?.nodes.length || graph.document?.texts.length
                ) && (
                  <div className={css.studioWrap}>
                    <CapsuleStudio
                      allowKgSearch={false}
                      allowCopySave={false}
                      key={"graph" + theme.revision}
                      capsule={initialView(graph)}
                      readOnly
                      externalFocus={graphFocus}
                      onFocusKey={focusGraphKey}
                      destination="テーマの現在版"
                    />
                  </div>
                )}
            </div>
            <div className={css.timelinePane} hidden={tab === "graph"}>
              <ThemeTimeline
                graphRecordIds={
                  graph?.revision === theme.revision
                    ? theme.records
                        .filter((r) => r.kind === "relation")
                        .map((r) => r.id)
                    : []
                }
                records={theme.records}
                entities={theme.entities}
                timeline={theme.timeline}
                focusedRecordId={focusedRecordId}
                onFocusRecord={setFocusedRecordId}
                selectedRecordIds={selected}
                onToggleSelected={toggleRecord}
                onShowGraph={showRecordInGraph}
                onEditRecord={(r) => {
                  setRecord(r);
                  setModal("record");
                }}
              />
            </div>
          </div>
          {tab === "list" && (
            <details className={css.selection}>
              <summary>
                選択 {selected.length}件
                {selected.some((id) => !shown.some((r) => r.id === id))
                  ? ` · この条件外 ${selected.filter((id) => !shown.some((r) => r.id === id)).length}件`
                  : ""}
              </summary>
              <div className={css.actions}>
                <button onClick={() => setSelected([])}>選択を解除</button>
                <button
                  onClick={() =>
                    setSelected((a) => [
                      ...new Set([...a, ...shown.map((r) => r.id)]),
                    ])
                  }
                >
                  表示中を選択
                </button>
              </div>
              <ul>
                {theme.records
                  .filter((r) => selected.includes(r.id))
                  .map((r) => (
                    <li key={r.id}>{r.assertion}</li>
                  ))}
              </ul>
            </details>
          )}
          {tab === "list" && (
            <ul className={css.records}>
              {shown.map((r) => (
                <li className={css.record} key={r.id}>
                  <input
                    type="checkbox"
                    aria-label={r.relation || r.assertion}
                    checked={selected.includes(r.id)}
                    onChange={() =>
                      setSelected((a) =>
                        a.includes(r.id)
                          ? a.filter((i) => i !== r.id)
                          : [...a, r.id],
                      )
                    }
                  />
                  <div className={css.recordMain}>
                    <p className={css.recordTitle}>{r.assertion}</p>
                    <div className={css.meta}>
                      <span>{timeLabel(r)}</span>
                      <span>{r.mapping?.concept?.label ?? "原文のまま"}</span>
                      <span>内容版 {r.revision}</span>
                    </div>
                    <details>
                      <summary className={css.caption}>
                        根拠・範囲を読む
                      </summary>
                      <Evidence record={r} />
                    </details>
                  </div>
                  <div className={css.actions}>
                    <button
                      onClick={() => {
                        setRecord(r);
                        setModal("record");
                      }}
                    >
                      訂正
                    </button>
                    <button
                      onClick={() => {
                        setRecord(r);
                        setModal("mapping");
                      }}
                    >
                      意味を整理
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {cap && (
        <>
          <section className={css.heading}>
            <Link
              className={css.back}
              href={shareToken ? "/themes" : "/themes/" + cap.snapshot.themeId}
            >
              ← {shareToken ? "テーマ一覧" : "元のテーマ"}
            </Link>
            {shareToken && (
              <p>
                共有された保存版 {cap.revision} ·
                作者が反映した内容を読んでいます。
              </p>
            )}
          </section>
          {!shareToken && (
            <div className={css.actions}>
              <button
                disabled={busy || studioEditing}
                onClick={() =>
                  void submit(
                    { action: "share", id: cap.id, expected: cap.revision },
                    (v) => {
                      const c = v as ThemeCapsule;
                      setCap(c);
                      setShareUrl(
                        window.location.origin +
                          "/themes/shared/" +
                          c.shareToken,
                      );
                      setMessage(
                        "保存版 " + c.revision + " を共有へ反映しました。",
                      );
                    },
                  )
                }
              >
                {cap.shareToken ? "保存内容を共有へ反映" : "共有リンクを作る"}
              </button>
              {cap.shareToken && (
                <>
                  <Link
                    href={"/themes/shared/" + cap.shareToken}
                    target="_blank"
                    rel="noreferrer"
                  >
                    共有版を開く ↗
                  </Link>
                  <button
                    disabled={busy || studioEditing}
                    onClick={() =>
                      void submit(
                        {
                          action: "share",
                          id: cap.id,
                          expected: cap.revision,
                          stop: true,
                        },
                        (v) => {
                          setCap(v as ThemeCapsule);
                          setShareUrl("");
                          setMessage("共有を停止しました。");
                        },
                      )
                    }
                  >
                    共有を停止
                  </button>
                  <span className={css.caption}>
                    共有中：保存版 {cap.sharedRevision}
                  </span>
                </>
              )}
            </div>
          )}
          {shareUrl && (
            <label className={css.caption}>
              このPCの確認用共有URL
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
          {!shareToken && graphCleanup && (
            <details className={css.updates}>
              <summary>旧形式の自動注記を整理</summary>
              <p className={css.caption}>
                年表の説明から作られた注記{graphCleanup.removedTexts}
                件と対象の自動説明{graphCleanup.cleanedDescriptions}
                件を、関係図から外します。
                文面・書式・配置を編集した注記や、独自の対象・関係は残します。年表の記録は残り、共有中の版は変わりません。図の編集を保存する前なら、整理前へ戻せます。
              </p>
              <button
                disabled={busy || studioEditing}
                onClick={() =>
                  void submit(
                    {
                      action: "capsule-clean-graph",
                      id: cap.id,
                      expected: cap.revision,
                    },
                    async () => {
                      await load();
                      setGeneration((g) => g + 1);
                      setMessage(
                        "関係図の自動注記を整理しました。共有先へは、共有への反映操作で更新できます。",
                      );
                    },
                  )
                }
              >
                自動注記を図から外す
              </button>
            </details>
          )}
          {!shareToken && cap.graphCleanupUndo && (
            <div className={css.actions}>
              <button
                disabled={busy || studioEditing}
                onClick={() =>
                  void submit(
                    {
                      action: "capsule-restore-graph",
                      id: cap.id,
                      expected: cap.revision,
                    },
                    async () => {
                      await load();
                      setGeneration((g) => g + 1);
                      setMessage(
                        "整理前の図へ戻しました。共有中の版は変わりません。",
                      );
                    },
                  )
                }
              >
                整理前の図に戻す
              </button>
              <span className={css.caption}>
                図の編集を保存する前まで戻せます
              </span>
            </div>
          )}
          {!shareToken && !!diff.length && (
            <details className={css.updates}>
              <summary>
                取り込んだ記録に {diff.length}件の更新があります
              </summary>
              <p className={css.caption}>
                独自のラベル・メモ・配置と、共有中の版は保持します。図の編集中は先に保存してください。
              </p>
              {diff.map((d) => (
                <div className={css.update} key={d.recordId}>
                  <label>
                    <input
                      type="checkbox"
                      checked={updates.includes(d.recordId)}
                      onChange={() =>
                        setUpdates((a) =>
                          a.includes(d.recordId)
                            ? a.filter((i) => i !== d.recordId)
                            : [...a, d.recordId],
                        )
                      }
                    />{" "}
                    {d.kind === "meaning" ? "意味の整理" : "内容の訂正"}
                  </label>
                  <div className={css.diff}>
                    <div>
                      保存時<p>{d.before.assertion}</p>
                      {d.before.scope}
                      <p>{d.before.mapping?.concept?.label ?? "意味未整理"}</p>
                    </div>
                    <div>
                      現在<p>{d.after?.assertion}</p>
                      {d.after?.scope}
                      <p>{d.after?.mapping?.concept?.label ?? "意味未整理"}</p>
                    </div>
                  </div>
                  <RecordChanges change={d} entities={cap.snapshot.entities} />
                </div>
              ))}
              <button
                disabled={busy || studioEditing || !updates.length}
                onClick={() =>
                  void submit(
                    {
                      action: "capsule-refresh",
                      id: cap.id,
                      expected: cap.revision,
                      themeRevision,
                      recordIds: updates,
                    },
                    async () => {
                      await load();
                      setGeneration((g) => g + 1);
                      setMessage(
                        "選択した更新を取り込みました。共有へ反映するまでは共有版は変わりません。",
                      );
                    },
                  )
                }
              >
                選択した更新を取り込む
              </button>
            </details>
          )}
          <div className={css.toolbar}>
            <div className={css.tabs} aria-label="Capsuleの表示">
              {[
                ["graph", "関係図"],
                ["time", "年表"],
                ["both", "並べて読む"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={tab === id}
                  disabled={studioEditing}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab !== "graph" && (
              <span className={css.caption}>
                保存した記録の時期 · 図の独自編集と分けて保持
              </span>
            )}
          </div>
          <div className={css.visualWorkspace} data-mode={tab}>
            <div className={css.graphPane} hidden={tab === "time"}>
              {!cap.document.nodes.length &&
              !cap.document.texts.length &&
              !createEmptyGraph &&
              !studioEditing ? (
                <EmptyRelationshipGraph
                  onTimeline={() => setTab("time")}
                  onCreate={
                    shareToken ? undefined : () => setCreateEmptyGraph(true)
                  }
                />
              ) : (
                <div className={css.studioWrap}>
                  <CapsuleStudio
                    allowKgSearch={false}
                    allowCopySave={false}
                    key={cap.id + ":" + generation}
                    capsule={initialView(local(cap))}
                    externalFocus={graphFocus}
                    onFocusKey={focusGraphKey}
                    onEditingChange={onStudioEditingChange}
                    startEditing={createEmptyGraph}
                    readOnly={!!shareToken}
                    destination="独立確認環境"
                    onSave={
                      shareToken
                        ? undefined
                        : async (v) => {
                            const saved = (await run({
                              action: "capsule-save",
                              id: cap.id,
                              expected: cap.revision,
                              title: v.title,
                              description: v.note,
                              document: v.document,
                            })) as ThemeCapsule;
                            setCap(saved);
                            return local(saved);
                          }
                    }
                  />
                </div>
              )}
            </div>
            <div className={css.timelinePane} hidden={tab === "graph"}>
              <ThemeTimeline
                graphRecordIds={cap.snapshot.records
                  .filter((r) => {
                    const key = recordKeys[r.id];
                    return [
                      ...cap.document.relations,
                      ...cap.document.texts,
                    ].some((item) => item.key === key);
                  })
                  .map((r) => r.id)}
                records={cap.snapshot.records}
                entities={cap.snapshot.entities}
                timeline={cap.snapshot.timeline}
                focusedRecordId={focusedRecordId}
                onFocusRecord={setFocusedRecordId}
                selectedRecordIds={[]}
                onShowGraph={showRecordInGraph}
              />
            </div>
          </div>
        </>
      )}
      {modal && (
        <CapsuleModal
          title="テーマの編集"
          dismissible={!busy}
          className={css.shell}
          onClose={() => setModal(null)}
        >
          <div className={css.formHeading}>
            <h2>
              {modal === "import"
                ? "根拠パッケージを取り込む"
                : modal === "mapping"
                  ? "この記録の意味を整理"
                  : record
                    ? "記録を訂正する"
                    : theme
                      ? "記録を加える"
                      : "テーマを作る"}
            </h2>
            <button
              disabled={busy}
              aria-label="閉じる"
              onClick={() => setModal(null)}
            >
              ×
            </button>
          </div>
          {error && (
            <p role="alert" className={css.error}>
              {error}
            </p>
          )}
          {modal === "import" ? (
            <div className={css.form}>
              <p className={css.caption}>
                根拠と対象を確認し、一つのテーマとして登録します。意味への対応は後からでも構いません。
              </p>
              <textarea
                aria-label="根拠パッケージJSON"
                className={css.jsonInput}
                value={json}
                onChange={(e) => {
                  setJson(e.target.value);
                  setPreview(null);
                }}
              />
              {!preview ? (
                <button
                  onClick={() => {
                    try {
                      setPreview(themePackageSchema.parse(JSON.parse(json)));
                      setError("");
                    } catch (e) {
                      setError(
                        "入力形式を確認してください：" + (e as Error).message,
                      );
                    }
                  }}
                >
                  内容を確認
                </button>
              ) : (
                <>
                  <h3>{preview.title}</h3>
                  <ul className={css.reviewList}>
                    {preview.records.map((r) => (
                      <li key={r.id}>
                        {r.assertion}
                        <p>
                          {r.evidence
                            .map((e) => e.title + " / " + e.locator)
                            .join("、")}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <button
                    data-primary
                    disabled={busy}
                    onClick={() =>
                      void submit(
                        { action: "import", package: preview },
                        (v) => {
                          router.push("/themes/" + (v as ThemeDetail).id);
                        },
                      )
                    }
                  >
                    {busy ? "登録中…" : "根拠を確認して登録"}
                  </button>
                </>
              )}
            </div>
          ) : modal === "record" ? (
            <RecordForm
              theme={theme}
              record={record}
              busy={busy}
              onSubmit={async (body) => {
                await submit(body, (v) => {
                  if (!theme) router.push("/themes/" + (v as ThemeDetail).id);
                  else {
                    setTheme(v as ThemeDetail);
                    setModal(null);
                    setMessage("記録を保存しました。");
                  }
                });
              }}
            />
          ) : (
            record &&
            theme && (
              <form
                className={css.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget),
                    choice = String(f.get("choice")),
                    label = String(f.get("label")),
                    definition = String(f.get("definition"));
                  const existing = concepts.find((c) => c.id === choice);
                  const meaningKey = JSON.stringify([label, definition]);
                  const meaningId =
                    meaningIds.current.get(meaningKey) ?? crypto.randomUUID();
                  meaningIds.current.set(meaningKey, meaningId);
                  void submit(
                    {
                      action: "mapping",
                      themeId: theme.id,
                      expected: theme.revision,
                      recordId: record.id,
                      concept:
                        choice === "none"
                          ? null
                          : (existing ?? {
                              id: meaningId,
                              label,
                              definition,
                            }),
                      reason: String(f.get("reason")),
                    },
                    (v) => {
                      setTheme(v as ThemeDetail);
                      setModal(null);
                      setMessage("この記録の意味対応を保存しました。");
                    },
                  );
                }}
              >
                <p>{record.assertion}</p>
                <label>
                  対応する意味
                  <select
                    name="choice"
                    defaultValue={record.mapping?.concept?.id ?? "new"}
                  >
                    <option value="new">新しい意味を定義</option>
                    <option value="none">未整理へ戻す</option>
                    {concepts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} — {c.definition}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  新しい意味の名前
                  <input
                    name="label"
                    defaultValue={record.mapping?.concept?.label ?? ""}
                  />
                </label>
                <label>
                  何を意味するか
                  <textarea
                    name="definition"
                    defaultValue={record.mapping?.concept?.definition ?? ""}
                  />
                </label>
                <label>
                  対応・訂正の理由
                  <input required name="reason" />
                </label>
                <button disabled={busy} data-primary>
                  この記録に適用
                </button>
              </form>
            )
          )}
        </CapsuleModal>
      )}
    </main>
  );
}
function RecordForm({
  theme,
  record,
  busy,
  onSubmit,
}: {
  theme: ThemeDetail | null;
  record: ThemeRecord | null;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [formError, setFormError] = useState("");
  function entityLabel(e: ThemeEntity) {
    return (theme?.entities.filter((x) => x.name === e.name).length ?? 0) > 1
      ? `${e.name}（${e.kind} · ${e.id}）`
      : e.name;
  }
  const [enteredAt] = useState(() => new Date().toISOString());
  const [newId] = useState(() => crypto.randomUUID());
  const newEntities = useRef(new Map<string, string>());
  const [kind, setKind] = useState(record?.kind ?? "relation");
  return (
    <form
      className={css.form}
      onSubmit={(e) => {
        e.preventDefault();
        setFormError("");
        try {
          const f = new FormData(e.currentTarget),
            get = (n: string) => String(f.get(n) ?? "").trim();
          const entities: ThemeEntity[] = [];
          function entity(name: string) {
            const old =
              theme?.entities.find((e) => entityLabel(e) === name) ??
              entities.find((e) => e.name === name);
            if (old) return old.id;
            if (
              (theme?.entities.filter((e) => e.name === name).length ?? 0) > 1
            )
              throw new Error(
                "同じ名前の対象が複数あります。候補から分類・識別子を含む対象を選んでください。",
              );
            const id = newEntities.current.get(name) ?? crypto.randomUUID();
            newEntities.current.set(name, id);
            entities.push({ id, name, kind: "未分類", description: "" });
            return id;
          }
          const subject = entity(get("subject")),
            object = kind === "relation" ? entity(get("object")) : null;
          const evidence = f.getAll("evidenceKey").map((key) => ({
            title: get(`evidence.${key}.title`),
            url: get(`evidence.${key}.url`),
            locator: get(`evidence.${key}.locator`),
            excerpt: get(`evidence.${key}.excerpt`),
            retrievedAt: get(`evidence.${key}.retrievedAt`),
          }));
          const r = {
            id: record?.id ?? newId,
            kind,
            subject,
            object,
            assertion: get("assertion"),
            relation: get("relation"),
            scope: get("scope"),
            polarity: get("polarity"),
            time:
              get("timeMode") === "none"
                ? null
                : get("timeMode") === "keep"
                  ? (record?.time ?? null)
                  : themeTimeSchema.parse({
                      kind: "calendar",
                      from: get("from"),
                      ...(get("timeMode") !== "point" ? { to: get("to") } : {}),
                      ...(get("timeMode") !== "unclassified-range" &&
                      !(
                        record?.time?.kind === "calendar" &&
                        !record.time.meaning &&
                        !record.time.to &&
                        get("timeMode") === "point"
                      )
                        ? { meaning: get("timeMode") }
                        : {}),
                      ...(get("timeMode") === "duration" && get("startLatest")
                        ? { startLatest: get("startLatest") }
                        : {}),
                      ...(get("timeMode") === "duration" && get("endEarliest")
                        ? { endEarliest: get("endEarliest") }
                        : {}),
                      label: get("timeLabel"),
                    }),
            evidence,
          };
          void onSubmit(
            theme
              ? {
                  action: "record",
                  themeId: theme.id,
                  expected: theme.revision,
                  record: r,
                  entities,
                  reason: get("reason") || "記録の追加",
                  detachTimelinePlacement:
                    f.get("detachTimelinePlacement") === "on",
                }
              : {
                  action: "import",
                  package: {
                    schemaVersion: 1,
                    id: newId,
                    title: get("title"),
                    description: get("description"),
                    entities,
                    records: [r],
                  },
                },
          );
        } catch (error) {
          setFormError(
            error &&
              typeof error === "object" &&
              "issues" in error &&
              Array.isArray(error.issues)
              ? error.issues
                  .map((issue: { message: string }) => issue.message)
                  .join(" / ")
              : (error as Error).message,
          );
        }
      }}
    >
      {formError && (
        <p role="alert" className={css.error}>
          {formError}
        </p>
      )}
      {!theme && (
        <>
          <label>
            テーマ名
            <input required name="title" maxLength={80} />
          </label>
          <label>
            何が面白いテーマですか
            <textarea name="description" />
          </label>
        </>
      )}
      <div className={css.columns}>
        <label>
          記録の種類
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="relation">関係</option>
            <option value="episode">エピソード</option>
            <option value="note">説明・情報</option>
          </select>
        </label>
        <label>
          肯否・確かさ
          <select name="polarity" defaultValue={record?.polarity ?? "affirmed"}>
            <option value="affirmed">肯定</option>
            <option value="denied">否定</option>
            <option value="uncertain">推測・不確実</option>
          </select>
        </label>
      </div>
      <datalist id="theme-entities">
        {theme?.entities.map((e) => (
          <option key={e.id} value={entityLabel(e)} />
        ))}
      </datalist>
      <div className={css.columns}>
        <label>
          主語・対象
          <input
            required
            list="theme-entities"
            name="subject"
            defaultValue={
              theme?.entities.find((e) => e.id === record?.subject)
                ? entityLabel(
                    theme.entities.find((e) => e.id === record?.subject)!,
                  )
                : undefined
            }
          />
        </label>
        {kind === "relation" && (
          <label>
            相手
            <input
              required
              list="theme-entities"
              name="object"
              defaultValue={
                theme?.entities.find((e) => e.id === record?.object)
                  ? entityLabel(
                      theme.entities.find((e) => e.id === record?.object)!,
                    )
                  : undefined
              }
            />
          </label>
        )}
      </div>
      {kind === "relation" && (
        <label>
          図に表示する関係の言葉
          <input
            required
            name="relation"
            placeholder="英訳した、注釈を加えた、提供した…"
            defaultValue={record?.relation}
          />
        </label>
      )}
      <label>
        具体的に何が分かるか
        <textarea required name="assertion" defaultValue={record?.assertion} />
      </label>
      <ThemeEvidenceFields
        evidence={record?.evidence}
        records={theme?.records ?? []}
        enteredAt={enteredAt}
        busy={busy}
      />
      <details open={!!record}>
        <summary>範囲・時期を補足</summary>
        <label>
          対象版・条件など
          <input name="scope" defaultValue={record?.scope} />
        </label>
        <ThemeTimeFields time={record?.time ?? null} />
        {record &&
          theme?.timeline?.placements.some((p) => p.recordId === record.id) && (
            <label className={css.checkLabel}>
              <input type="checkbox" name="detachTimelinePlacement" />
              この記録の年表配置を外して訂正する
            </label>
          )}
        <p className={css.caption}>
          周期・定性軸はパッケージ取込で指定できます。
        </p>
      </details>
      {record && (
        <label>
          訂正の理由
          <input required name="reason" />
        </label>
      )}
      <div className={css.formFooter}>
        <button disabled={busy} data-primary>
          {busy ? "保存中…" : record ? "訂正を保存" : "根拠を確認して登録"}
        </button>
      </div>
    </form>
  );
}
