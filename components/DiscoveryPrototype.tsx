"use client";
import { useEffect, useRef, useState } from "react";
import type { ClaimSummary, EntitySummary } from "../lib/domain/api";
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { initialContext, prototypeSeeds, questionsForWorld, questionNames, questionPredicates, readPrototypeContext, resolveDiscovery, WORLD_IDS, worldNames, type DiscoveryContext, type QuestionId } from "../lib/domain/discovery-prototype";
import { usePrototypeQuery } from "../lib/client/use-discovery-prototype";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorationHref } from "../lib/client/exploration-url";
import { formatPeriod, polarityLabel, qualificationLabel } from "../lib/client/format";
import { explorationLabels } from "../lib/i18n/exploration";
import { contributionLabels } from "../lib/i18n/contribution";
import { localizedPublicHref } from "../lib/domain/public-routes";
import DiscoveryPrototypeEvidence from "./DiscoveryPrototypeEvidence";
import Icon from "./Icon";
import styles from "./DiscoveryPrototype.module.css";
type Entry = "connections" | "worlds";
type Variant = "staged" | "tabs";
type Label = readonly [string, string];
const textOf = (value: Label, locale: string) => value[locale === "en" ? 1 : 0];
const relationChoices = ["connections", "credits", "affiliations", "influences"] as const;
const relationNames: Record<typeof relationChoices[number], Label> = { connections: ["すべて", "All"], credits: ["制作", "Production"], affiliations: ["所属", "Affiliation"], influences: ["影響", "Influence"] };
type GraphHref = (id: string, all?: boolean) => string;

function Seed({ seed, preset = false, onChoose }: { seed: typeof prototypeSeeds[number]; preset?: boolean; onChoose: (entity: EntitySummary) => void }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const query = usePrototypeQuery({ state: "ready", operation: "neighbors", anchorId: seed.id, predicate: questionPredicates[seed.question]!, role: null }, null);
  const data = query.result, name = data?.anchor?.name ?? (seed.world === "manga" ? "PLUTO" : seed.id === prototypeSeeds[1].id ? "Princeton" : en ? "Niels Bohr Institute" : "ニールス・ボーア研究所");
  const title = seed.world === "manga" ? ["PLUTOのつくり手", "Who made PLUTO?"] : seed.id === prototypeSeeds[1].id ? ["Princetonの人々", "People at Princeton"] : ["研究所で出会う", "Meet through NBI"];
  const action = preset ? (en ? "Start with " + title[1] + ": subject and relation" : title[0] + "から始める：対象と関係を設定") : en ? "Use " + name + " as subject" : name + "を対象にする";
  return <span className={preset ? styles.preset : styles.seed} data-seed={seed.id}>
    <button disabled={!data?.anchor || !data.claims.length} onClick={() => onChoose(data!.anchor!)} aria-label={action}>
      {preset ? <><strong>{en ? title[1] : seed.world === "manga" ? <>PLUTO<wbr/>のつくり手</> : seed.id === prototypeSeeds[1].id ? <>Princeton<wbr/>の人々</> : <>研究所で<wbr/>出会う</>}</strong><small>{seed.world === "manga" ? "PLUTO" : seed.id === prototypeSeeds[1].id ? "Princeton" : "NBI"} · {textOf(relationNames[seed.question], locale)}</small></> : name}
    </button>{query.error && <button onClick={query.retry}>{en ? "Retry example" : "例を再確認"}</button>}
  </span>;
}
function ClaimRow({ claim, nodes, anchor, revision, onChoose, graphHref }: { claim: ClaimSummary; nodes: EntitySummary[]; anchor: EntitySummary; revision: string; onChoose: (entity: EntitySummary) => void; graphHref: GraphHref }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [evidence, setEvidence] = useState(false);
  const subject = nodes.find(n => n.id === claim.subjectId) ?? (anchor.id === claim.subjectId ? anchor : null);
  const object = nodes.find(n => n.id === claim.objectId) ?? (anchor.id === claim.objectId ? anchor : null);
  const target = claim.subjectId === anchor.id ? object : subject, qualification = qualificationLabel(claim, locale), scope = claim.contribution?.scope;
  return <article className={styles.claim} data-testid="prototype-claim" data-claim={claim.id}>
    <div className={styles.claimIdentity}><strong>{target?.name ?? (en ? "Unknown entity" : "対象未確認")}</strong><span className={styles.polarity} data-denied={claim.polarity === "denied"}>{polarityLabel(claim, locale)}</span></div>
    <p className={styles.statement}>{subject?.name} → {explorationLabels(locale).predicates[claim.predicate]} → {object?.name}</p>
    <div className={styles.facts}>{qualification && <strong>{qualification}</strong>}<span>{formatPeriod(claim.period, locale)}</span><span>{en ? claim.sourceCount + " source(s)" : "出典 " + claim.sourceCount + "件"}</span></div>
    {claim.contribution && <p className={styles.scope}>{scope ? (scope.volumeLabel ?? (en ? "Volume unspecified" : "巻未確認")) + " · ISBN " + scope.isbn13 : en ? "Publication scope unstructured" : "刊行物の適用範囲は未構造化"}</p>}
    <div className={styles.rowActions}>{target && <button onClick={() => onChoose(target)} aria-label={en ? "Change subject to " + target.name : "対象を" + target.name + "に変更"}>{en ? "Use as subject" : "対象にする"} ↶</button>}<button className={styles.quiet} aria-expanded={evidence} onClick={() => setEvidence(v => !v)}>{evidence ? (en ? "Close evidence" : "根拠を閉じる") : (en ? "Read evidence" : "根拠を開く")} {evidence ? "−" : "＋"}</button>{target && <a className={styles.graphLink} href={graphHref(target.id)} aria-label={en ? "Open " + target.name + " in Graph" : target.name + "をGraphで開く"}>Graph ↗</a>}</div>
    {evidence && <div className={styles.evidence}><DiscoveryPrototypeEvidence id={claim.id} revision={revision} nodes={[anchor, ...nodes]}/></div>}
  </article>;
}

export default function DiscoveryPrototype() {
  const { locale, setLocale } = useUiLocale(), en = locale === "en";
  const t = (ja: string, english: string) => en ? english : ja;
  const [context, setContext] = useState<DiscoveryContext>(initialContext);
  const [lookupOpen, setLookupOpen] = useState(false), [lookupQ, setLookupQ] = useState("");
  const [undo, setUndo] = useState<{ context: DiscoveryContext; label: Label; lookupOpen: boolean; lookupQ: string } | null>(null);
  const [entry, setEntry] = useState<Entry>("connections"), [variant, setVariant] = useState<Variant>("tabs");
  const [ready, setReady] = useState(false), [composing, setComposing] = useState(false), [cursors, setCursors] = useState<(string | null)[]>([null]);
  const dialog = useRef<HTMLDialogElement>(null), body = useRef<HTMLDivElement>(null), launch = useRef<HTMLButtonElement>(null);
  const scrolls = useRef<Record<Entry, number>>({ connections: 0, worlds: 0 });
  const basePlan = resolveDiscovery(context);
  // Name lookup changes the visible operation, while keeping all exploration criteria.
  const names = lookupOpen || (!context.anchor && basePlan.state !== "unsupported");
  const plan = names ? lookupQ.trim() ? { state: "ready" as const, operation: "names" as const, q: lookupQ.trim() } : { state: "needs-name" as const } : basePlan;
  const query = usePrototypeQuery(ready ? plan : { state: "needs-anchor" }, names ? null : cursors.at(-1)!, composing && names);
  useEffect(() => {
    const timer = setTimeout(() => {
      let saved = window.history.state?.discoveryPrototype;
      if (!saved) { try { saved = JSON.parse(sessionStorage.getItem("plunode.discovery-prototype.v1") ?? "null"); } catch { /* Optional storage. */ } }
      if (saved) {
        const restored = readPrototypeContext(saved.context);
        setContext({ ...restored, names: false, q: restored.names ? "" : restored.q });
        setLookupOpen(saved.lookupOpen === true || restored.names);
        setLookupQ(typeof saved.lookupQ === "string" ? saved.lookupQ.slice(0, 100) : restored.names ? restored.q : "");
        if (saved.entry === "worlds") setEntry("worlds");
        if (saved.layoutVersion === 2 && saved.variant === "staged") setVariant("staged");
      }
      setReady(true); dialog.current?.showModal(); document.getElementById("prototype-title")?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const snapshot = { layoutVersion: 2, context, entry, variant, lookupOpen, lookupQ };
    window.history.replaceState({ ...window.history.state, discoveryPrototype: snapshot }, "", window.location.href);
    try { sessionStorage.setItem("plunode.discovery-prototype.v1", JSON.stringify(snapshot)); } catch { /* In-memory use remains available. */ }
  }, [ready, context, entry, variant, lookupOpen, lookupQ]);
  const change = (next: DiscoveryContext, label: Label) => {
    if (JSON.stringify(next) === JSON.stringify(context)) return;
    setUndo({ context, label, lookupOpen, lookupQ }); setContext(next);
    if (JSON.stringify(resolveDiscovery(context)) !== JSON.stringify(resolveDiscovery(next))) setCursors([null]);
  };
  const clearAll = () => {
    setUndo({ context, label: ["すべての条件の解除", "Clear all criteria"], lookupOpen, lookupQ });
    setContext(initialContext); setLookupOpen(false); setLookupQ(""); setCursors([null]);
  };
  const chooseSubject = (anchor: EntitySummary) => {
    change({ ...context, anchor, names: false }, ["対象の変更", "Subject change"]); setLookupOpen(false);
    requestAnimationFrame(() => document.getElementById("prototype-subject")?.focus({ preventScroll: true }));
  };
  const pickQuestion = (question: QuestionId) => { change({ ...context, question }, ["関係・問いの変更", "Relation / question change"]); setLookupOpen(false); };
  const switchEntry = (next: Entry) => {
    scrolls.current[entry] = body.current?.scrollTop ?? 0; setEntry(next);
    requestAnimationFrame(() => { if (body.current) body.current.scrollTop = scrolls.current[next]; });
  };
  const startNames = () => { setLookupOpen(true); requestAnimationFrame(() => document.getElementById("prototype-name")?.focus({ preventScroll: true })); };
  const close = () => { dialog.current?.close(); launch.current?.focus({ preventScroll: true }); };
  const displayed = query.result ?? query.previous, blocked = query.loading || !!query.error;
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
  const claims = displayed?.claims.filter(c => !context.q.trim() || displayed.nodes.some(n => (n.id === c.subjectId || n.id === c.objectId) && n.id !== context.anchor?.id && normalize(n.name).includes(normalize(context.q.trim())))) ?? [];
  const candidates = new Map<string, EntitySummary>();
  if (!names && query.result?.anchor) for (const claim of query.result.claims) {
    const anchorId = query.result.anchor.id, target = query.result.nodes.find(n => n.id === (claim.subjectId === anchorId ? claim.objectId : claim.subjectId));
    if (target) candidates.set(target.id, target);
  }
  const graphHref: GraphHref = (id, all = false) => (en ? "/en" : "") + explorationHref({
    version: 1, dataset: "public-kg", id, rootId: id, title: "Discovery prototype", savedAt: "2000-01-01T00:00:00.000Z",
    conditions: { predicates: !all && basePlan.state === "ready" && basePlan.operation === "neighbors" && basePlan.predicate ? [basePlan.predicate] : null, contributionRoles: !all && context.role ? [context.role] : null, organizationPositions: null, eventRoles: null },
    branches: [{ id, open: true, pages: 1 }], view: null,
  });
  const appliedGraph = basePlan.state === "ready" && basePlan.operation === "neighbors";
  const hasConditions = !!context.world || !!context.anchor || context.question !== "connections" || !!context.role || !!context.q;
  const showPresets = !context.anchor && context.question === "connections" && !context.role && !context.q;
  const presets = <div className={styles.presetChoices} data-testid="prototype-presets">{prototypeSeeds.map(seed => <Seed key={seed.id} seed={seed} preset onChoose={anchor => { change({ ...context, anchor, question: seed.question }, ["プリセットの適用", "Preset application"]); setLookupOpen(false); requestAnimationFrame(() => document.getElementById("prototype-subject")?.focus({ preventScroll: true })); }}/>)}</div>;
  const seeds = <span className={styles.seedChoices}>{prototypeSeeds.map(seed => <Seed key={seed.id} seed={seed} onChoose={chooseSubject}/>)}</span>;

  return <main className={styles.page}>
    <p className={styles.eyebrow}>PLUNODE / DISCOVERY LAB</p><h1>{t("探索UIを試す", "Try Discovery Lab")}</h1>
    <button ref={launch} onClick={() => { dialog.current?.showModal(); document.getElementById("prototype-title")?.focus({ preventScroll: true }); }}>{t("試作を開く", "Open prototype")}</button> <a href={localizedPublicHref("/", locale)}>{t("Home・現在の検索へ", "Home & current search")}</a>
    <dialog ref={dialog} className={styles.dialog} onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="prototype-title">
      <header className={styles.header}><div><span className={styles.eyebrow}>DISCOVERY LAB</span><h2 id="prototype-title" tabIndex={-1}>{t("探索する", "Explore")}</h2></div><div className={styles.headerActions}><select aria-label={t("表示言語", "Language")} value={locale} onChange={e => setLocale(e.target.value as "ja" | "en")}><option value="ja">日本語</option><option value="en">English</option></select><button aria-label={t("試作を閉じる", "Close prototype")} onClick={close}><Icon name="close"/></button></div></header>
      <div ref={body} className={styles.body} data-testid="prototype-body">
          <nav className={styles.entryNav} aria-label={t("探索の入口", "Discovery entrances")}>
            {variant === "tabs" ? <div className={styles.tabs} role="tablist" aria-label={t("探索の入口", "Discovery entrances")}>{(["connections", "worlds"] as const).map(value => <button key={value} role="tab" id={"prototype-tab-" + value} aria-controls="prototype-entry" aria-selected={entry === value} tabIndex={entry === value ? 0 : -1} onClick={() => switchEntry(value)} onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? "connections" : e.key === "End" ? "worlds" : entry === "connections" ? "worlds" : "connections"; switchEntry(next); document.getElementById("prototype-tab-" + next)?.focus({ preventScroll: true }); } }}>{value === "connections" ? t("今ある接点から", "Existing connections") : t("知識世界から", "Knowledge worlds")}</button>)}</div>
            : <button className={styles.stagedSwitch} onClick={() => switchEntry(entry === "connections" ? "worlds" : "connections")}>{entry === "connections" ? t("知識世界から探す →", "Explore knowledge worlds →") : t("接点から探す →", "Explore connections →")}</button>}
            <button className={styles.layoutToggle} onClick={() => { setVariant(variant === "tabs" ? "staged" : "tabs"); }}>{variant === "tabs" ? t("段階表示を試す", "Try staged layout") : t("タブ表示に戻す", "Use tabs")}</button>
          </nav>
        <section className={styles.selectionSummary} aria-label={t("選択要約", "Selection summary")}>
          <div className={styles.summaryChips}>
            <span className={styles.selectionChip}><button id="prototype-subject" onClick={startNames}>{t("対象：", "Subject: ")}{context.anchor?.name ?? t("名前から指定", "choose by name")}</button>{context.anchor && <button aria-label={t("対象だけ外す", "Remove only subject")} onClick={() => change({ ...context, anchor: null }, ["対象の解除", "Subject removal"])}>×</button>}</span>
            <span className={styles.selectionChip}><button onClick={() => switchEntry("worlds")}>{context.world ? textOf(worldNames[context.world], locale) : t("世界を選ぶ", "Choose a world")}</button>{context.world && <button aria-label={t("世界だけ外す", "Remove only world")} onClick={() => change({ ...context, world: null }, ["世界の解除", "World removal"])}>×</button>}</span>
            {context.question !== "connections" && <span className={styles.selectionChip}><span>{textOf(questionNames[context.question], locale)}</span><button aria-label={t("問いだけ外す", "Remove only question")} onClick={() => pickQuestion("connections")}>×</button></span>}
            {context.role && <span className={styles.selectionChip}><span>{contributionLabels(locale).roles[context.role]}</span><button aria-label={t("制作役割だけ外す", "Remove only role")} onClick={() => change({ ...context, role: null }, ["制作役割の解除", "Role removal"])}>×</button></span>}
            {context.q && <span className={styles.selectionChip}><span>{t("名前：", "Name: ")}{context.q}</span><button aria-label={t("名前の絞込だけ外す", "Remove only name filter")} onClick={() => change({ ...context, q: "" }, ["名前の絞込の解除", "Name filter removal"])}>×</button></span>}
          </div>
          <div className={styles.conditionActions}><button className={styles.undo} disabled={!undo} onClick={() => { if (undo) { setContext(undo.context); setLookupOpen(undo.lookupOpen); setLookupQ(undo.lookupQ); setUndo(null); setCursors([null]); } }}>{undo ? t("取り消す：" + textOf(undo.label, locale), "Undo: " + textOf(undo.label, locale)) : t("取り消す", "Undo")}</button><button className={styles.clearAll} disabled={!hasConditions && !lookupQ} onClick={clearAll}>{t("すべての条件を解除", "Clear all criteria")}</button></div>
        </section>
        <section className={styles.entryPanel}>
          <div id="prototype-entry" role={variant === "tabs" ? "tabpanel" : undefined} aria-labelledby={variant === "tabs" ? "prototype-tab-" + entry : undefined}>
            {entry === "connections" ? <>{showPresets ? <><span className={styles.optionalLabel}>{t("ここから始める（任意）", "A place to begin · optional")}</span>{presets}</> : <><span className={styles.optionalLabel}>{t("参考の接点（任意）", "Optional connections")}</span>{!!candidates.size && <div className={styles.targetChoices} data-testid="prototype-next-targets"><span>{t("対象を変更：", "Change subject:")}</span>{[...candidates.values()].slice(0, 4).map(target => <button key={target.id} onClick={() => chooseSubject(target)} aria-label={t(target.name + "を対象にする", "Use " + target.name + " as subject")}>{target.name}</button>)}</div>}<div className={styles.exampleRow}><span>{t("対象の例：", "Examples:")}</span>{seeds}</div></>}</>
            : <>          <div className={styles.conditionRow}><span className={styles.fieldLabel}>{t("世界", "World")}</span><div className={styles.worldChoices} aria-label={t("世界の選択", "World interests")}><button aria-label={context.world ? t("世界だけ外す", "Remove only world") : t("世界を指定しない", "No world interest")} aria-pressed={!context.world} onClick={() => change({ ...context, world: null }, ["世界の解除", "World removal"])}>{t("指定なし", "Any")}</button>{WORLD_IDS.map(world => <button key={world} data-world={world} aria-pressed={context.world === world} onClick={() => change({ ...context, world }, ["世界の変更", "World change"])}>{textOf(worldNames[world], locale)}</button>)}<small>{t("関心の印・分類検索ではありません", "Interest only, no classification filter")}</small></div></div>
{context.world ? <div className={styles.questions} aria-label={t("問いの候補", "Question suggestions")}><span>{t("問いを変更：", "Change question:")}</span>{questionsForWorld[context.world].map(question => <button key={question} aria-pressed={context.question === question} onClick={() => pickQuestion(question)}>{textOf(questionNames[question], locale)}{!questionPredicates[question] && <small>{t("未対応", "unsupported")}</small>}</button>)}</div> : <span className={styles.note}>{t("世界から問いを選ぶことも、下の名前から探すこともできます。", "Choose a question by world, or search by name below.")}</span>}<small className={styles.coverage}>{t("世界全体の収録状況・正式な収集予定は未確認", "World coverage and formal collection plans are unassessed")}</small></>}
          </div>
        </section>
        <section className={styles.relationControls} aria-label={t("関係の条件を編集", "Edit relation criteria")}>
          <div className={styles.conditionRow}><span className={styles.fieldLabel}>{t("見る関係", "Relations")}</span><div className={styles.relations} aria-label={t("関係の条件", "Relation criteria")}>{relationChoices.map(question => <button key={question} aria-pressed={context.question === question} onClick={() => pickQuestion(question)}>{textOf(relationNames[question], locale)}</button>)}</div>{!relationChoices.includes(context.question as typeof relationChoices[number]) && <span className={styles.pending}>{textOf(questionNames[context.question], locale)}<button className={styles.remove} aria-label={t("問いだけ外す", "Remove only question")} onClick={() => pickQuestion("connections")}>×</button></span>}</div>
          {(context.question === "credits" || context.role) && <div className={styles.conditionRow}><span className={styles.fieldLabel}>{t("制作役割", "Role")}</span><div className={styles.roleChoices} aria-label={t("制作役割の条件", "Production role criteria")}>{context.question === "credits" ? <><button data-role="" aria-pressed={!context.role} onClick={() => change({ ...context, role: null }, ["制作役割の解除", "Role removal"])}>{t("限定なし", "Any role")}</button>{CONTRIBUTION_ROLE_IDS.map(role => <button key={role} data-role={role} aria-pressed={context.role === role} onClick={() => change({ ...context, role }, ["制作役割の変更", "Role change"])}>{contributionLabels(locale).roles[role]}</button>)}</> : <span>{context.role ? contributionLabels(locale).roles[context.role] : t("制作を選ぶと役割も指定できます", "Choose production to specify a role")}</span>}{context.role && <button className={styles.remove} aria-label={t("制作役割だけ外す", "Remove only role")} onClick={() => change({ ...context, role: null }, ["制作役割の解除", "Role removal"])}>×</button>}</div></div>}
        </section>
        {basePlan.state === "unsupported" && <aside className={styles.unavailable} data-testid="prototype-unsupported"><strong>{t("検索方式が未対応", "Search method unsupported")}{names && t("（条件は保持中）", " (criteria retained)")}</strong><p>{textOf(basePlan.reason, locale)}</p><span>{t("収録状況は未確認。この問いを実行していないため、0件とは判定していません。", "Coverage unassessed. This question was not executed, so it is not a zero-result search.")}</span><div>{!names && <button onClick={startNames}>{t("条件を保って名前を探す", "Find names, keeping criteria")}</button>}{context.role && <><button onClick={() => change({ ...context, role: null }, ["制作役割の解除", "Role removal"])}>{t("制作役割だけ外す", "Remove only the role")}</button><button onClick={() => pickQuestion("credits")}>{t("関係を制作に変更", "Change relation to production")}</button></>}</div></aside>}
        <section className={styles.matches} aria-label={t("探索結果", "Discovery results")} aria-busy={query.loading}>
          <form className={styles.keyword} data-testid="prototype-keyword" onSubmit={e => { e.preventDefault(); query.retry(); }}>
            <div className={styles.keywordLabel}><label htmlFor="prototype-name">{names ? t("名前・別名から探す", "Find a name or alias") : t("このページの相手の名前で絞る", "Filter connected names on this page")}</label>{names && context.anchor && <button type="button" onClick={() => setLookupOpen(false)}>{t(context.anchor.name + "の関係に戻る", "Back to " + context.anchor.name)}</button>}</div>
            <div className={styles.inputRow}><Icon name="search"/><input id="prototype-name" value={names ? lookupQ : context.q} maxLength={100} placeholder={t("名前を入力（候補を選ばず検索できます）", "Enter a name; suggestions are optional")} onChange={e => names ? setLookupQ(e.target.value) : change({ ...context, q: e.target.value }, ["名前の絞込", "Name filter"])} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}/>{(names ? lookupQ : context.q) && <button type="button" onClick={() => names ? setLookupQ("") : change({ ...context, q: "" }, ["名前の絞込の解除", "Name filter removal"])}>{t("消去", "Clear")}</button>}<button type="submit">{t("検索", "Search")}</button></div>
          </form>
          {names && hasConditions && <p className={styles.lookupNote}>{t("選択条件は保持中。名前候補には世界・関係・役割の条件を適用しません。", "Criteria retained. World, relation and role filters do not apply to these name matches.")}</p>}
          <div className={styles.resultHeading}><div><h3 id="prototype-results-title" tabIndex={-1}>{names ? t("名前の候補", "Name matches") : t("関係の記録", "Relation records")}</h3><span role="status">{query.loading ? t("取得中…", "Loading…") : query.result ? names ? t(query.result.items.length + "件", query.result.items.length + " matches") : t("このページ " + claims.length + "件", claims.length + " on this page") : ""}</span></div>{context.anchor && appliedGraph && <a className={styles.graphLaunch} data-testid="prototype-graph" href={graphHref(context.anchor.id)}>{t(context.anchor.name + "をGraphで開く", "Open " + context.anchor.name + " in Graph")} ↗</a>}</div>
          {query.error && <div role="alert" className={styles.unavailable}><p>{query.conflict ? t("公開KGの版が変わりました。先頭から再取得してください。", "The public KG changed. Refresh from the first page.") : t("記録を取得できませんでした。再試行してください。", "Could not load records. Please retry.")}</p><button onClick={() => { setCursors([null]); query.retry(); }}>{t("再取得", "Retry")}</button></div>}
          {plan.state !== "ready" ? <div className={styles.empty}>{plan.state === "needs-name" ? t("名前を入力して検索できます。上の候補を選ぶこともできます。", "Search by name, or optionally choose a suggestion above.") : plan.state === "unsupported" ? t("問いは保持しています。関係を変更するか、条件を保って名前を探せます。", "Question retained. Change the relation or search names while keeping it.") : t("名前から対象を選ぶと、関係の記録を確認できます。", "Choose a subject by name to see its relation records.")}</div>
          : <div className={styles.resultStage} data-testid="prototype-results" data-updating={blocked || undefined}><div inert={blocked} aria-hidden={blocked || undefined}>
            {displayed && names && displayed.items.map(entity => <div className={styles.nameRow} key={entity.id}><div><strong>{entity.name}</strong>{entity.description && <p>{entity.description}</p>}</div><div className={styles.rowActions}><button onClick={() => chooseSubject(entity)} aria-label={t("対象を" + entity.name + "に変更", "Change subject to " + entity.name)}>{t("対象にする", "Use as subject")}</button><a className={styles.graphLink} href={graphHref(entity.id, true)} aria-label={t(entity.name + "を全関係のGraphで開く", "Open " + entity.name + " in Graph with all relations")}>Graph ↗<small>{t("全関係", "all relations")}</small></a></div></div>)}
            {displayed?.anchor && !names && <div className={styles.recordList}>{claims.map(claim => <ClaimRow key={displayed.revision + ":" + claim.id} claim={claim} nodes={displayed.nodes} anchor={displayed.anchor!} revision={displayed.revision} onChoose={chooseSubject} graphHref={graphHref}/>)}</div>}
            {query.result && (names ? !query.result.items.length : !claims.length) && <div className={styles.empty}><strong>{t("この条件・取得範囲では該当なし", "No match in this request's scope")}</strong><p>{t("世界全体のデータがないという意味ではありません。", "This does not mean this whole world has no data.")}</p>{!names && context.q && <button onClick={() => change({ ...context, q: "" }, ["名前の絞込の解除", "Name filter removal"])}>{t("名前の絞込だけ外す", "Remove only the name filter")}</button>}{!names && context.role && <button onClick={() => change({ ...context, role: null }, ["制作役割の解除", "Role removal"])}>{t("制作役割だけ外す", "Remove only the role")}</button>}</div>}
          </div>{query.loading && !displayed && <div className={styles.skeleton} aria-hidden="true"/>}</div>}
          {!names && plan.state === "ready" && <nav className={styles.pagination} aria-label={t("記録のページ", "Record pages")}><button disabled={blocked || cursors.length === 1} onClick={() => setCursors(v => v.slice(0, -1))}>{t("前へ", "Previous")}</button><span>{t(cursors.length + "ページ", "Page " + cursors.length)}</span><button disabled={blocked || !query.result?.nextCursor} onClick={() => setCursors(v => [...v, query.result!.nextCursor])}>{t("次へ", "Next")}</button></nav>}
          {query.result?.hasMore && <p className={styles.note}>{names ? t("続きがあります。名前を具体的にすると候補を絞れます。", "More names match. Refine the name.") : t("未取得の続きがあります。名前の絞込は現在のページだけです。", "More records are available. Names are filtered only on this page.")}</p>}
          {!names && query.result?.claims.some(c => c.predicate === "AFFILIATED_WITH") && <p className={styles.note}>{t("同じ機関への記録は、同時在籍・交流・共同研究の証明ではありません。", "A shared institution does not prove simultaneous affiliation, contact or collaboration.")}</p>}
          <p className={styles.scopeNote}>{t("両方向の一段を取得。名前の絞込は現在のページのみ。Graphには関係と制作役割を引き継ぎます。", "One step, both directions. Name filtering applies to this page. Graph carries relation and role filters.")}</p>
          {query.result && <small className={styles.revision}>PUBLIC KG · {query.result.revision}</small>}
        </section>
      </div>
    </dialog>
  </main>;
}
