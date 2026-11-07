"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { themeTimeLabel } from "../lib/domain/theme-time";
import type {
  KnowledgeEntityVersion as EntityVersion,
  KnowledgeSourceVersion as SourceVersion,
  KnowledgeRecordVersion as RecordVersion,
  KnowledgeThemeVersion as ThemeVersion,
  KnowledgeList,
  KnowledgeSnapshot,
} from "../lib/domain/knowledge-foundation";
import { correctionKnowledgeInputDraft, newKnowledgeInputDraft, prepareKnowledgeInputSubmission, readKnowledgeInputDraft, writeKnowledgeInputDraft, type KnowledgeInputDraft, type KnowledgeInputField, type KnowledgeInputChoice } from "../lib/client/knowledge-input-draft";
import KnowledgeTimeFields from "./KnowledgeTimeFields";
import KnowledgeTimelineFields from "./KnowledgeTimelineFields";
import KnowledgeSourceBibliography from "./KnowledgeSourceBibliography";
import css from "./KnowledgeFoundation.module.css";

type Catalog = KnowledgeList & { sourceVersions?: SourceVersion[] };
type Resolved = KnowledgeSnapshot & { theme: ThemeVersion };
type Change = { kind: string; label: string; before: string; after: string };
const empty: Catalog = { records: [], entities: [], sources: [], themes: [], statuses: [] };

async function api(query = "", command?: unknown) {
  const response = await fetch("/api/knowledge" + query, command ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
  } : { cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "保存先に接続できません。入力を保ったまま再試行できます。");
  return value;
}

function RecordDetail({ record, entities, sources }: { record: RecordVersion; entities: EntityVersion[]; sources: SourceVersion[] }) {
  const r = record.content;
  const name = (id: string | null) => entities.find((e) => e.id === id)?.content.name ?? "対象なし";
  return <article className={css.detail}>
    <div className={css.meta}>内容版 {record.revision} · {({ relation: "関係", episode: "出来事", note: "説明・期間" })[r.kind]}</div>
    {r.kind === "relation" && <div className={css.relation}><strong>{name(r.subjectId)}</strong><span>→ {r.relation} →</span><strong>{name(r.objectId)}</strong></div>}
    <p>{r.assertion}</p>
    {r.polarity !== "affirmed" && <p>{r.polarity === "denied" ? "否定された関係" : "不確実な記録"}</p>}
    {r.scope && <p>範囲：{r.scope}</p>}
    {r.times.map((t) => <p key={t.id}>{themeTimeLabel(t.time)}</p>)}
    {r.evidence.map((e) => {
      const source = sources.find((s) => s.id === e.source.id && s.revision === e.source.revision);
      return <div className={css.evidence} key={e.id}>
        {source?.content.url ? <a href={source.content.url} target="_blank" rel="noreferrer">{source.content.title} ↗</a> : <strong>{source?.content.title ?? "資料"}</strong>}
        <div className={css.meta}>資料版 {e.source.revision} · {e.locator} · {({ support: "支持", refute: "反証", background: "背景" } as Record<string, string>)[e.stance] ?? e.stance}</div>
        {source?.content.bibliography && <KnowledgeSourceBibliography value={source.content.bibliography} className={css.meta}/>}
        <blockquote>{e.excerpt}</blockquote>
      </div>;
    })}
  </article>;
}

export default function KnowledgeFoundation() {
  const [catalog, setCatalog] = useState<Catalog>(empty);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<KnowledgeInputDraft | null>(null);
  const [entryContext, setEntryContext] = useState<{ id: string; revision: number } | null>(null);
  const creatingDraft = draft?.mode === "create" ? draft : null;
  const kind = creatingDraft?.kind ?? "relation";
  const editBase = editing && draft?.mode === "correct" ? draft.base : null;
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [theme, setTheme] = useState<Resolved | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [refreshToken, setRefreshToken] = useState("");
  const [showList, setShowList] = useState(true);
  const requests = useRef(new Map<string, string>());
  const themeRequest = useRef<string | null>(null);
  const active = catalog.records.find((r) => r.id === selected);
  const activeStatus = catalog.statuses?.find((s) => s.kind === "record" && s.id === selected);
  const load = useCallback(async () => { const value = await api(); setCatalog(value); setLoaded(true); }, []);
  useEffect(() => {
    let alive = true; let restored: KnowledgeInputDraft | null = null;
    try { restored = readKnowledgeInputDraft(sessionStorage); } catch { /* Storage is optional; live input remains usable. */ }
    api().then((v: Catalog) => { if (alive) {
      setCatalog(v); setDraft(restored); setLoaded(true);
      const params = new URL(window.location.href).searchParams, recordId = params.get("record");
      if (recordId && v.records.some(r => r.id === recordId)) {
        setSelected(recordId); setShowList(false);
        const from = params.get("fromRevision") ?? "", revision = Number(from);
        if (/^[1-9][0-9]*$/.test(from) && Number.isSafeInteger(revision)) setEntryContext({ id: recordId, revision });
      }
    } }).catch((e) => { if (alive) { setDraft(restored); setError(e.message); } });
    return () => { alive = false; };
  }, []);

  function preserveDraft(next: KnowledgeInputDraft | null) {
    setDraft(next);
    try { if (!writeKnowledgeInputDraft(sessionStorage, next)) setError("このタブで入力を保持できません。移動する前に保存してください。"); } catch { setError("このタブで入力を保持できません。移動する前に保存してください。"); }
  }
  function field(name: KnowledgeInputField) { return { value: draft?.values[name] ?? "", onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { if (draft) preserveDraft({ ...draft, values: { ...draft.values, [name]: event.target.value } }); } }; }
  const choiceValue = (choice: KnowledgeInputChoice | null | undefined) => choice ? choice.id + "@" + choice.revision : "";
  function choose(side: "subject" | "object" | "source", value: string) {
    if (!creatingDraft) return;
    const choice = side === "source" ? catalog.sources.find(s => choiceValue({ ...s, label: s.content.title }) === value) : catalog.entities.find(e => choiceValue({ ...e, label: e.content.name }) === value);
    preserveDraft({ ...creatingDraft, [side]: choice ? { id: choice.id, revision: choice.revision, label: "title" in choice.content ? choice.content.title : choice.content.name } : null });
  }
  function resumeDraft() {
    if (!draft) return;
    if (draft.mode === "correct" && !catalog.records.some(r => r.id === draft.base.id)) { setError("訂正元の記録を読み込めません。入力は保持しています。"); return; }
    setCreating(draft.mode === "create"); setEditing(draft.mode === "correct"); setSelected(draft.mode === "correct" ? draft.base.id : null); setTheme(null); setShowList(false); setError(""); setMessage("");
  }
  function discardDraft() { preserveDraft(null); setCreating(false); setEditing(false); setMessage("保存前の入力を破棄しました。"); }
  function beginCorrection() {
    if (editing) { setEditing(false); return; }
    if (!active) return;
    if (draft) { if (draft.mode === "correct" && draft.base.id === active.id) resumeDraft(); else setMessage("保存前の入力を再開するか、破棄してください。"); return; }
    preserveDraft(correctionKnowledgeInputDraft(active)); setEditing(true); setCreating(false); setMessage("");
  }

  async function execute(command: Record<string, unknown>, success: string, onSaved?: () => void) {
    const key = JSON.stringify(command);
    const requestId = typeof command.requestId === "string" ? command.requestId : requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, requestId);
    setBusy(true); setError(""); setMessage("");
    let saved = false;
    try {
      await api("", { ...command, requestId }); saved = true; onSaved?.(); await load(); setMessage(success); return true;
    } catch (e) { setError(saved ? "保存は完了しました。一覧を再読込してください。" : e instanceof Error ? e.message : "操作を完了できませんでした"); if (saved) setMessage(success); return saved; }
    finally { setBusy(false); }
  }

  function begin() {
    if (draft) { setMessage("保存前の入力を再開するか、破棄してください。"); return; }
    preserveDraft(newKnowledgeInputDraft()); setCreating(true); setEditing(false); setSelected(null); setTheme(null); setShowList(false); setMessage("");
  }

  async function addRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!creatingDraft) return;
    const prepared = prepareKnowledgeInputSubmission(creatingDraft); preserveDraft(prepared.draft);
    await execute(prepared.command, "記録を登録しました。テーマへは必要なときに追加できます。", () => { preserveDraft(null); setCreating(false); setSelected(creatingDraft.ids.record); });
  }

  async function correct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (draft?.mode !== "correct") return;
    const prepared = prepareKnowledgeInputSubmission(draft); preserveDraft(prepared.draft);
    await execute(prepared.command, "原記録を訂正しました。テーマの保存版はそのままです。", () => { preserveDraft(null); setEditing(false); });
  }

  async function openTheme(id: string, preserveMessage = false) {
    setBusy(true); setError(""); setSelected(null); setCreating(false); setEditing(false);
    setShowList(false); if (!preserveMessage) setMessage("");
    try { const data = await api("?theme=" + encodeURIComponent(id)); setTheme(data.resolved); setChanges(data.changes); setRefreshToken(data.refreshToken); }
    catch (e) { setError(e instanceof Error ? e.message : "テーマを開けませんでした"); } finally { setBusy(false); }
  }
  async function createTheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); const id = themeRequest.current ??= crypto.randomUUID();
    const chosen = catalog.records.filter((r) => checked.includes(r.id));
    const entityIds = new Set(chosen.flatMap((r) => [r.content.subjectId, r.content.objectId]));
    const ok = await execute({ action: "create-theme", id, title: String(f.get("title")), description: "", recordPins: chosen.map((r) => ({ id: r.id, revision: r.revision })), entityPins: catalog.entities.filter((e) => entityIds.has(e.id)).map((e) => ({ id: e.id, revision: e.revision })), initialView: "split" }, "選んだ記録の版をテーマに保存しました。");
    if (ok) { setChecked([]); themeRequest.current = null; await openTheme(id, true); }
  }

  const records = catalog.records.filter((r) => [r.content.assertion, r.content.relation, ...catalog.entities.filter((e) => [r.content.subjectId, r.content.objectId].includes(e.id)).map((e) => e.content.name)].join(" ").normalize("NFKC").toLowerCase().includes(query.normalize("NFKC").toLowerCase()));
  return <main className={css.shell}>
    <header className={css.header}><Link href="/themes">← テーマと年表</Link><Link href="/">探索へ戻る →</Link><span className={css.meta}>このPCの確認用 · 運営者の操作</span></header>
    <div className={css.intro}><h1>共通の記録</h1><p>根拠とともに残し、複数のテーマから同じ記録を使えます。</p></div>
    {draft && !creating && !editing && <div className={css.notice}><span>{draft.mode === "create" ? "保存前の記録があります。" : "保存前の訂正があります。"}</span><button disabled={!loaded || busy} onClick={resumeDraft}>入力を再開</button><button disabled={busy} onClick={discardDraft}>入力を破棄</button></div>}
    {message && <p className={css.notice} role="status">{message}</p>}
    {error && <div className={`${css.notice} ${css.error}`} role="alert">{error}<button onClick={() => { setError(""); if (theme) void openTheme(theme.theme.id); else void load().catch((e) => setError(e.message)); }}>{theme ? "最新の差分を確認" : "表示を再読込"}</button></div>}
    <fieldset className={css.interaction} disabled={busy || !loaded}><div className={css.grid}>
      <section className={css.panel} aria-label="記録一覧" data-collapsed={!showList && Boolean(selected || theme || creating)}>
        <div className={css.heading}><h2>記録 · {catalog.records.length}</h2>{Boolean(selected || theme || creating) && <button className={css.mobileOnly} onClick={() => setShowList(!showList)} aria-expanded={showList}>{showList ? "一覧を閉じる" : "一覧を開く"}</button>}<button data-primary onClick={begin} disabled={busy}>＋ 記録を加える</button></div>
        <label className={css.form}>名前・関係・内容で探す<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="記録を絞り込み" /></label>
        {!loaded ? <p className={css.hint}>読み込み中…</p> : !records.length ? <p className={css.hint}>表示できる記録がありません。</p> : <div className={css.list}>{records.map((r) => <div key={r.id}>
          <button className={css.row} aria-pressed={selected === r.id} onClick={() => { setSelected(r.id); setTheme(null); setCreating(false); setEditing(false); setShowList(false); setMessage(""); }}><strong>{r.content.assertion}</strong><span className={css.meta}>{r.content.relation || "説明・出来事"} · 内容版 {r.revision}</span></button>
          <label className={css.check}><input type="checkbox" checked={checked.includes(r.id)} onChange={(e) => setChecked((s) => e.target.checked ? [...s, r.id] : s.filter((id) => id !== r.id))} />テーマへ選択</label>
        </div>)}</div>}
        <details><summary>選んだ記録でテーマを作る · {checked.length}件</summary><form className={css.form} onSubmit={createTheme}><label>テーマの名前<input name="title" required maxLength={300} /></label><span className={css.hint}>絞り込みで見えない選択も含めて保存します。</span><button disabled={busy || !checked.length}>選んだ版でテーマを作る</button></form></details>
        <div className={css.themes}><h2 className={css.hint}>保存したテーマ</h2>{catalog.themes.map((t) => <button key={t.id} onClick={() => openTheme(t.id)} disabled={busy}>{t.content.title} · 版 {t.revision}</button>)}</div>
      </section>
      <section className={css.panel} aria-label="記録の内容">
        {creating ? <><div className={css.heading}><h2>記録を加える</h2><button onClick={() => setCreating(false)}>閉じる</button></div><form className={css.form} onSubmit={addRecord}>
          <label>記録の種類<select value={kind} onChange={(e) => { if (creatingDraft) preserveDraft({ ...creatingDraft, kind: e.target.value as "relation" | "episode" | "note" }); }}><option value="relation">対象どうしの関係</option><option value="episode">出来事・エピソード</option><option value="note">説明・期間</option></select></label>
          <div className={css.pair}>{(["subject", ...(kind === "relation" ? ["object"] : [])] as ("subject" | "object")[]).map((side) => <fieldset key={side}><legend>{side === "subject" ? "対象" : "相手"}{kind !== "relation" && "（任意）"}</legend><label>登録済みから選ぶ<select value={choiceValue(creatingDraft?.[side])} onChange={(e) => choose(side, e.target.value)}><option value="">新しい対象／指定しない</option>{creatingDraft?.[side] && !catalog.entities.some(e => e.id === creatingDraft[side]?.id && e.revision === creatingDraft[side]?.revision) && <option value={choiceValue(creatingDraft[side])}>{creatingDraft[side]?.label} · 版 {creatingDraft[side]?.revision}（入力時）</option>}{catalog.entities.map((e) => <option key={e.id} value={choiceValue({ ...e, label: e.content.name })}>{e.content.name} · {e.content.kind} · 版 {e.revision} · {e.id.slice(0, 6)}</option>)}</select></label>{!creatingDraft?.[side] && <><label>名前<input {...field(side === "subject" ? "subjectName" : "objectName")} name={side + "Name"} required={kind === "relation"} maxLength={200} /></label><label>分類<input {...field(side === "subject" ? "subjectKind" : "objectKind")} name={side + "Kind"} placeholder="人物、作品、組織など" maxLength={60} /></label></>}</fieldset>)}</div>
          {kind === "relation" && <label>具体的な関係<input {...field("relation")} name="relation" required maxLength={200} placeholder="原資料の意味に合う言葉で" /></label>}
          <label>具体的な内容<textarea {...field("assertion")} name="assertion" required maxLength={4000} /></label>
          <label>肯否・不確実性<select {...field("polarity")} name="polarity"><option value="affirmed">肯定</option><option value="denied">否定</option><option value="uncertain">不確実</option></select></label>
          <details><summary>範囲・時期を添える</summary><div className={css.form}><label>対象範囲<input {...field("scope")} name="scope" maxLength={3000} /></label><KnowledgeTimeFields locale="ja" value={draft?.times??[]} onChange={times=>{if(draft)preserveDraft({...draft,times});}} guidance/></div></details>
          <fieldset><legend>根拠</legend><label>資料を再利用<select value={choiceValue(creatingDraft?.source)} onChange={(e) => choose("source", e.target.value)}><option value="">新しい資料</option>{creatingDraft?.source && !catalog.sources.some(s => s.id === creatingDraft.source?.id && s.revision === creatingDraft.source?.revision) && <option value={choiceValue(creatingDraft.source)}>{creatingDraft.source.label} · 版 {creatingDraft.source.revision}（入力時）</option>}{catalog.sources.map((s) => <option key={s.id} value={choiceValue({ ...s, label: s.content.title })}>{s.content.title} · 版 {s.revision}</option>)}</select></label>{!creatingDraft?.source && <><label>資料名<input {...field("sourceTitle")} name="sourceTitle" required maxLength={300} /></label><label>URL<input {...field("sourceUrl")} name="sourceUrl" type="url" maxLength={2000} placeholder="書籍などは空欄にして書誌を記入" /></label><label>書誌・版<input {...field("bibliography")} name="bibliography" maxLength={3000} /></label></>}<label>該当箇所<input {...field("locator")} name="locator" required maxLength={1000} /></label><label>その箇所の内容・抜粋<textarea {...field("excerpt")} name="excerpt" required maxLength={4000} /></label></fieldset>
          <div className={css.actions}><button data-primary disabled={busy}>{busy ? "保存中…" : "記録を登録"}</button><button type="button" onClick={discardDraft} disabled={busy}>入力を破棄</button></div>
        </form></> : active ? <>
          <div className={css.heading}><h2>記録の内容</h2><button onClick={beginCorrection} disabled={busy}>{editing ? "編集を閉じる" : "内容を訂正"}</button></div>
          {!editing && entryContext?.id === active.id && entryContext.revision !== active.revision && <p className={css.hint}>読んでいた内容版 {entryContext.revision} ／ 編集対象 {active.revision}。内容を確認してから訂正できます。</p>}
          {activeStatus?.visibility !== "public" && <p className={css.notice}>この記録は現在、閲覧用の表示から外れています。</p>}
          {editing && editBase ? <form className={css.form} onSubmit={correct}><span className={css.hint}>内容版 {editBase.revision} からの訂正</span>{editBase.content.kind === "relation" && <label>関係の言葉<input {...field("relation")} name="relation" required /></label>}<label>具体的な内容<textarea {...field("assertion")} name="assertion" required /></label><KnowledgeTimeFields locale="ja" value={draft?.times??editBase.content.times} onChange={times=>{if(draft)preserveDraft({...draft,times});}} guidance/><label>訂正理由<input {...field("reason")} name="reason" required /></label><div className={css.actions}><button data-primary disabled={busy}>新しい版として保存</button><button type="button" onClick={discardDraft}>入力を破棄</button></div></form> : <RecordDetail record={active} entities={catalog.entities} sources={catalog.sourceVersions ?? catalog.sources} />}
          <details><summary>登場する対象の名前を訂正</summary>{catalog.entities.filter((e) => [active.content.subjectId, active.content.objectId].includes(e.id)).map((entity) => <form key={entity.id + ":" + entity.revision} className={css.form} onSubmit={async (event) => { event.preventDefault(); const f = new FormData(event.currentTarget); await execute({ action: "correct", kind: "entity", id: entity.id, expectedRevision: entity.revision, content: { ...entity.content, name: String(f.get("name")) }, reason: String(f.get("reason")) }, "対象の名前を訂正しました。テーマ内の観測版は保持しています。"); }}><label>名前<input name="name" defaultValue={entity.content.name} required /></label><label>理由<input name="reason" required /></label><button disabled={busy}>対象の訂正を保存</button></form>)}</details>
          {activeStatus && <details><summary>この記録の表示を管理</summary><form className={css.form} onSubmit={async (event) => { event.preventDefault(); const f = new FormData(event.currentTarget); await execute({ action: "set-visibility", kind: "record", id: active.id, expectedStatusRevision: activeStatus.revision, visibility: activeStatus.visibility === "public" ? "hidden" : "public", reason: String(f.get("reason")) }, activeStatus.visibility === "public" ? "閲覧用の表示から外しました。記録と履歴は保持しています。" : "閲覧用の表示へ戻しました。"); }}><label>変更理由<input name="reason" required /></label><button disabled={busy}>{activeStatus.visibility === "public" ? "表示を止める" : "表示を戻す"}</button></form></details>}
        </> : theme ? <>
          <div className={css.heading}><h2>{theme.theme.content.title}</h2><span className={css.meta}>保存した構成版 {theme.theme.revision}</span></div>
          <p className={css.hint}>このテーマが保存した記録・対象・資料の版を読んでいます。</p>
          {changes.length > 0 ? <div className={css.changes}><strong>元記録に{changes.length}件の変更</strong>{changes.map((c, i) => <div key={i}><p>{c.label}</p><p className={css.hint}>{c.before} → {c.after}</p></div>)}{changes.some((c) => c.kind === "source") && <p className={css.hint}>資料の新版は、記録の引用先を明示訂正するまで差し替えません。</p>}<button data-primary disabled={busy || !changes.some((c) => c.kind !== "source")} onClick={async () => { const ok = await execute({ action: "refresh-theme", id: theme.theme.id, expectedRevision: theme.theme.revision, refreshToken, reason: "差分を確認して最新の記録を明示反映" }, "このテーマへ更新を反映しました。他のテーマはそのままです。"); if (ok) await openTheme(theme.theme.id, true); }}>元記録の更新を反映</button></div> : <p className={css.hint}>未反映の変更はありません。</p>}
          <KnowledgeTimelineFields records={theme.records} value={theme.theme.content.timeline} onSave={async timeline=>{const ok=await execute({action:"correct",kind:"theme",id:theme.theme.id,expectedRevision:theme.theme.revision,content:{...theme.theme.content,timeline},reason:"年表の軸と接続先を明示編集"},"年表の構成を保存しました。");if(ok)await openTheme(theme.theme.id,true);return ok;}}/>{theme.records.map((record) => <RecordDetail key={record.id} record={record} entities={theme.entities} sources={theme.sources} />)}
        </> : <><h2 className={css.hint}>記録を選ぶ</h2><p className={css.hint}>テーマを作る前でも、根拠付きの関係や出来事を残せます。</p></>}
      </section>
    </div></fieldset>
  </main>;
}
