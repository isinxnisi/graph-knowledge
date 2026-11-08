"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { featuredThemeCatalogSchema, featuredThemeSettingsSchema, type SaveFeaturedThemes } from "../lib/domain/featured-themes";
import { knowledgeThemeKind, knowledgeThemeTypeLabel, type KnowledgeThemeSummary } from "../lib/domain/knowledge-theme-reader";
import { memberRequest, MemberClientError } from "../lib/client/member-api";
import { useUiLocale } from "../lib/client/ui-locale";
import { FeaturedThemeRail } from "./ThemeDiscovery";
import Icon from "./Icon";
import css from "./FeaturedThemesOperations.module.css";

const endpoint = "/api/site-operations/featured-themes";
type Catalog = z.infer<typeof featuredThemeCatalogSchema>;
export function FeaturedThemesOperations({ userId, authorized, registerGuard }: {
  userId: string; authorized: boolean; registerGuard?: (guard: () => boolean) => void;
}) {
  const { locale } = useUiLocale(), en = locale === "en", t = (ja: string, english: string) => en ? english : ja;
  const [saved, setSaved] = useState<Catalog | null>(null), [ids, setIds] = useState<string[]>([]);
  const [query, setQuery] = useState(""), [kind, setKind] = useState("all"), [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false), [sending, setSending] = useState(false), [error, setError] = useState("");
  const [message, setMessage] = useState(""), [unknown, setUnknown] = useState(false), [conflict, setConflict] = useState(false), [attempt, setAttempt] = useState(0);
  const pending = useRef<SaveFeaturedThemes | null>(null), mounted = useRef(false), loadStarted = useRef(false), initialized = useRef(false);
  const dirty = !!saved && JSON.stringify(ids) !== JSON.stringify(saved.themeIds);
  const guard = useCallback(() => !(dirty || unknown || sending) || window.confirm(en ? "Leave without saving these featured themes?" : "紹介テーマの未保存の変更を閉じて移動しますか？"), [dirty, unknown, sending, en]);
  useEffect(() => { registerGuard?.(guard); return () => registerGuard?.(() => true); }, [guard, registerGuard]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!(dirty || unknown || sending)) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", prevent); return () => removeEventListener("beforeunload", prevent);
  }, [dirty, unknown, sending]);
  useEffect(() => {
    if (!authorized || loadStarted.current || initialized.current) return;
    const ac = new AbortController(); loadStarted.current = true;
    setLoading(true); setError("");
    memberRequest(endpoint, featuredThemeCatalogSchema, { user: userId, signal: ac.signal }).then(data => {
      if (ac.signal.aborted) return;
      initialized.current = true; setSaved(data); setIds(data.themeIds); setConflict(false); setMessage("");
    }).catch(() => { if (!ac.signal.aborted) setError(en ? "Could not load the themes. Your changes are kept." : "テーマを取得できません。入力中の変更は保持しています。"); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => { ac.abort(); loadStarted.current = false; };
  // Authorization refreshes must not replace an operator's unsaved selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, userId, attempt]);
  const byId = new Map(saved?.themes.map(theme => [theme.id, theme]) ?? []);
  const selected = ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const text = query.trim().toLocaleLowerCase();
  const matches = (saved?.themes ?? []).filter(theme => (!text || `${theme.title} ${theme.description}`.toLocaleLowerCase().includes(text)) && (kind === "all" || knowledgeThemeKind(theme) === kind));
  const locked = !authorized || loading || sending || unknown;
  function change(next: string[]) { setIds(next); setMessage(""); setError(""); }
  function move(index: number, direction: number) { const next = [...ids]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; change(next); }
  function reload() { initialized.current = false; loadStarted.current = false; setAttempt(n => n + 1); }
  async function save() {
    if (!saved || !authorized || sending) return;
    const body = pending.current ?? { requestId: crypto.randomUUID(), expectedRevision: saved.revision, themeIds: ids };
    pending.current = body; setSending(true); setError(""); setMessage("");
    try {
      const result = await memberRequest(endpoint, featuredThemeSettingsSchema.extend({ replayed: z.boolean() }), { method: "POST", user: userId, body });
      if (!mounted.current) return;
      // A replay can describe an earlier save. Never label a later operator's state as ours.
      setSaved({ ...saved, ...result }); setIds(result.themeIds); pending.current = null; setUnknown(false); setConflict(false);
      setMessage(result.replayed ? t("保存結果を確認しました。TOPで現在の掲載を確認できます。", "Save confirmed. You can check the current TOP page.") : t("保存しました。TOPの紹介テーマに反映しました。", "Saved. Featured themes on TOP are updated."));
    } catch (cause) {
      if (!mounted.current) return;
      if (!(cause instanceof MemberClientError) || cause.status >= 500) {
        setUnknown(true); setError(t("保存結果を確認できません。同じ内容で再確認できます。", "The save result is unknown. Retry the same request."));
      } else {
        pending.current = null; setUnknown(false);
        if (cause.status === 409) { setConflict(true); setError(t("掲載設定またはテーマの公開状態が変わりました。変更は保持しています。最新の設定を読み直して選び直してください。", "The selection or theme availability changed. Your edits are kept. Reload the current settings before saving.")); }
        else setError(cause.status === 401 || cause.status === 403 ? t("ログインと運営権限を再確認してください。変更は保持しています。", "Recheck your sign-in and operator access. Your edits are kept.") : t("保存できませんでした。もう一度お試しください。", "Could not save. Please retry."));
      }
    } finally { if (mounted.current) setSending(false); }
  }
  return <div className={css.editor}>
    <p className={css.intro}>{t("TOPで紹介する公開テーマを選び、順番を整えて保存します。", "Choose published themes for TOP, arrange them, then save.")}</p>
    {error && <div role="alert" className={css.feedback}>{error} {(!saved || conflict) && <button disabled={!authorized || sending} onClick={() => { if (!dirty || window.confirm(t("未保存の選択を破棄して、最新の設定を読み直しますか？", "Discard your selection and reload the current settings?"))) reload(); }}><Icon name="refresh"/>{t("最新の設定を読む", "Reload settings")}</button>}</div>}
    {message && <p role="status" className={css.feedback}><Icon name="check"/>{message} <a href={en ? "/en" : "/"} target="_blank" rel="noopener">{t("TOPを確認", "View TOP")} <Icon name="external"/></a></p>}
    {loading && <p role="status">{t("公開テーマを読み込んでいます…", "Loading published themes…")}</p>}
    {saved && <>
      <section aria-labelledby="featured-selected">
        <div className={css.heading}><h2 id="featured-selected">{t("掲載するテーマ", "Featured selection")} <small>{ids.length}</small></h2><span>{dirty ? t("未保存", "Unsaved") : t("保存済み", "Saved")}</span></div>
        <ol className={css.selection} aria-label={t("掲載順", "Featured order")}>
          {ids.map((id, index) => <li key={id}><span className={css.number}>{index + 1}</span><div className={css.identity}><strong>{byId.get(id)?.title ?? t("現在は公開されていないテーマ", "Currently unavailable theme")}</strong><small>{byId.has(id) ? knowledgeThemeTypeLabel(byId.get(id)!, en) : t("TOPには表示されません", "Not displayed on TOP")}</small></div><div className={css.actions}>
            <button disabled={locked || index === 0} aria-label={`${byId.get(id)?.title ?? index + 1}${t("を上へ", " · move up")}`} onClick={() => move(index, -1)}><span className={css.up}><Icon name="back"/></span></button>
            <button disabled={locked || index === ids.length - 1} aria-label={`${byId.get(id)?.title ?? index + 1}${t("を下へ", " · move down")}`} onClick={() => move(index, 1)}><span className={css.down}><Icon name="back"/></span></button>
            <button disabled={locked} aria-label={`${byId.get(id)?.title ?? index + 1}${t("を掲載から外す", " · remove from TOP")}`} onClick={() => change(ids.filter(value => value !== id))}><Icon name="close"/></button>
          </div></li>)}
        </ol>
        {!ids.length && <p className={css.muted}>{t("掲載するテーマを下の一覧から選んでください。0件で保存すると紹介欄を非表示にします。", "Choose themes below. Saving an empty selection hides the featured section.")}</p>}
        <details className={css.preview}><summary>{t("TOPでの見え方", "Preview on TOP")}</summary>{selected.length ? <FeaturedThemeRail themes={selected} onOpen={() => {}} openInNewTab/> : <p className={css.muted}>{t("紹介テーマの欄は表示されません。", "The featured section will be hidden.")}</p>}</details>
        <div className={css.save}><span>{t("新着テーマ・検索結果の並びは変わりません。", "Recent themes and search results are unchanged.")}</span><div className={css.actions}><button disabled={locked || !dirty} onClick={() => { change(saved.themeIds); setConflict(false); }}>{t("変更を破棄", "Discard changes")}</button><button className={css.primary} disabled={!authorized || sending || loading || conflict || (!dirty && !unknown)} onClick={() => void save()}><Icon name="check"/>{sending ? t("保存中…", "Saving…") : unknown ? t("保存結果を再確認", "Check save result") : t("掲載を保存", "Save selection")}</button></div></div>
      </section>
      <section aria-labelledby="featured-candidates">
        <div className={css.heading}><h2 id="featured-candidates">{t("公開テーマから選ぶ", "Choose published themes")}</h2><small>{matches.length}{t("件", " matches")}</small></div>
        <div className={css.search}><label><span className={css.srOnly}>{t("テーマの名前・説明", "Theme name or description")}</span><Icon name="search"/><input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} placeholder={t("名前・説明で絞り込む", "Filter by name or description")}/></label><select aria-label={t("テーマの表示内容", "Theme display type")} value={kind} onChange={event => { setKind(event.target.value); setLimit(20); }}><option value="all">{t("すべて", "All types")}</option><option value="timeline">{t("年表", "Timeline")}</option><option value="graph">{t("関係図のみ", "Relation graph only")}</option><option value="context">{t("解説", "Context")}</option></select></div>
        <ul className={css.candidates}>{matches.slice(0, limit).map((theme: KnowledgeThemeSummary) => <li key={theme.id}><div className={css.identity}><strong>{theme.title}</strong><small>{knowledgeThemeTypeLabel(theme, en)}</small></div><button disabled={locked || ids.includes(theme.id) || ids.length >= 24} onClick={() => change([...ids, theme.id])} aria-label={`${theme.title}${t("を掲載に追加", " · feature on TOP")}`}><Icon name={ids.includes(theme.id) ? "check" : "plus"}/>{ids.includes(theme.id) ? t("選択済み", "Selected") : t("追加", "Add")}</button></li>)}</ul>
        {!matches.length && <p className={css.muted}>{t("条件に合う公開テーマはありません。", "No published themes match.")}</p>}
        {matches.length > limit && <button onClick={() => setLimit(value => value + 20)}>{t("続きを表示", "Show more")}</button>}
        {ids.length >= 24 && <p className={css.muted}>{t("紹介テーマは24件まで選べます。", "You can select up to 24 featured themes.")}</p>}
      </section>
    </>}
  </div>;
}
