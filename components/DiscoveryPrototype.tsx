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
const textOf = (value: readonly [string, string], locale: string) => value[locale === "en" ? 1 : 0];

function Seed({ seed, onChoose }: { seed: typeof prototypeSeeds[number]; onChoose: (entity: EntitySummary, question: QuestionId) => void }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const query = usePrototypeQuery({ state: "ready", operation: "neighbors", anchorId: seed.id, predicate: questionPredicates[seed.question]!, role: null }, null);
  const data = query.result;
  const names = data ? [...new Set(data.claims.map(c => data.nodes.find(n => n.id === (c.subjectId === seed.id ? c.objectId : c.subjectId))?.name).filter(Boolean))].slice(0, 3) : [];
  return <article className={styles.seed} data-seed={seed.id}>
    <div className={styles.seedMark} aria-hidden="true"><svg viewBox="0 0 160 60"><path d="M16 34Q54 4 88 28T144 12M88 28L138 50"/><circle cx="16" cy="34" r="5"/><circle cx="88" cy="28" r="9"/><circle cx="144" cy="12" r="4"/><circle cx="138" cy="50" r="4"/></svg></div>
    <small>{en ? "EDITORIAL START · LIVE KG" : "編集した起点 · 公開KGで照合"}</small>
    <h3>{textOf(seed.title, locale)}</h3>
    <p>{data ? names.join(" / ") || (en ? "No matching records here." : "この起点の該当記録なし") : query.error ? (en ? "Could not verify this starting point." : "現在の起点を確認できませんでした") : (en ? "Checking published records…" : "公開された記録を確認中…")}</p>
    {data?.anchor && !!data.claims.length && <button onClick={() => onChoose(data.anchor!, seed.question)}>{en ? "Switch starting point & question" : "この起点・問いに切り替える"} <Icon name="arrow"/></button>}
    {query.error && <button onClick={query.retry}>{en ? "Retry" : "再確認"}</button>}
  </article>;
}

function ClaimRow({ claim, nodes, anchor, revision, onPivot }: { claim: ClaimSummary; nodes: EntitySummary[]; anchor: EntitySummary; revision: string; onPivot: (entity: EntitySummary) => void }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [evidence, setEvidence] = useState(false);
  const subject = nodes.find(n => n.id === claim.subjectId) ?? (anchor.id === claim.subjectId ? anchor : null);
  const object = nodes.find(n => n.id === claim.objectId) ?? (anchor.id === claim.objectId ? anchor : null);
  const target = claim.subjectId === anchor.id ? object : subject;
  const qualification = qualificationLabel(claim, locale);
  return <article className={styles.claim} data-testid="prototype-claim" data-claim={claim.id}>
    <div className={styles.claimIdentity}><span className={styles.nodeDot} aria-hidden="true"/><div><strong>{target?.name ?? (en ? "Unknown entity" : "対象未確認")}</strong><p>{subject?.name} → {explorationLabels(locale).predicates[claim.predicate]} → {object?.name}</p></div><span className={styles.polarity} data-denied={claim.polarity === "denied"}>{polarityLabel(claim, locale)}</span></div>
    <div className={styles.facts}>{qualification && <strong>{qualification}</strong>}<span>{formatPeriod(claim.period, locale)}</span><span>{en ? `${claim.sourceCount} source(s)` : `出典 ${claim.sourceCount}件`}</span></div>
    {claim.contribution && <p className={styles.scope}>{claim.contribution.scope ? `${claim.contribution.scope.volumeLabel ?? (en ? "Volume unspecified" : "巻未確認")} · ISBN ${claim.contribution.scope.isbn13}` : (en ? "Publication scope is not structured." : "適用する刊行物の範囲は未構造化")}
      {claim.contribution.scope && <span> · {en ? "Credit for this publication; not all editions or periods." : "指定刊行物の記録。全巻・全版・全期間の担当を示しません。"}</span>}</p>}
    <div className={styles.rowActions}>{target && <button onClick={() => onPivot(target)}>{en ? `Continue from ${target.name}` : `${target.name}の先へ`} <Icon name="arrow"/></button>}<button aria-expanded={evidence} onClick={() => setEvidence(v => !v)}>{evidence ? (en ? "Close evidence" : "根拠を閉じる") : (en ? "Read evidence" : "根拠を読む")}</button></div>
    {evidence && <div className={styles.evidence}><DiscoveryPrototypeEvidence id={claim.id} revision={revision} nodes={[anchor, ...nodes]}/></div>}
  </article>;
}

export default function DiscoveryPrototype() {
  const { locale, setLocale } = useUiLocale(), en = locale === "en";
  const t = (ja: string, english: string) => en ? english : ja;
  const [context, setContext] = useState<DiscoveryContext>(initialContext);
  const [undo, setUndo] = useState<DiscoveryContext | null>(null);
  const [entry, setEntry] = useState<Entry>("connections"), [variant, setVariant] = useState<Variant>("staged");
  const [chooser, setChooser] = useState(false), [worldDetails, setWorldDetails] = useState(false);
  const [ready, setReady] = useState(false), [composing, setComposing] = useState(false), [cursors, setCursors] = useState<(string | null)[]>([null]);
  const dialog = useRef<HTMLDialogElement>(null), body = useRef<HTMLDivElement>(null), launch = useRef<HTMLButtonElement>(null);
  const scrolls = useRef<Record<Entry, number>>({ connections: 0, worlds: 0 });
  const plan = resolveDiscovery(context);
  const query = usePrototypeQuery(ready ? plan : { state: "needs-anchor" }, cursors.at(-1)!, composing && context.names);
  useEffect(() => {
    const timer = setTimeout(() => {
      let saved = window.history.state?.discoveryPrototype;
      if (!saved) { try { saved = JSON.parse(sessionStorage.getItem("plunode.discovery-prototype.v1") ?? "null"); } catch { /* Session storage may be unavailable. */ } }
      if (saved) {
        setContext(readPrototypeContext(saved.context));
        if (saved.entry === "worlds") setEntry("worlds");
        if (saved.variant === "tabs") setVariant("tabs");
        setWorldDetails(saved.worldDetails === true);
      }
      setReady(true);
      dialog.current?.showModal();
      document.getElementById("prototype-title")?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const snapshot = { context, entry, variant, worldDetails };
    window.history.replaceState({ ...window.history.state, discoveryPrototype: snapshot }, "", window.location.href);
    try { sessionStorage.setItem("plunode.discovery-prototype.v1", JSON.stringify(snapshot)); } catch { /* In-memory exploration remains usable. */ }
  }, [ready, context, entry, variant, worldDetails]);
  const change = (next: DiscoveryContext) => {
    setUndo(context); setContext(next);
    if (JSON.stringify(resolveDiscovery(context)) !== JSON.stringify(resolveDiscovery(next))) setCursors([null]);
  };
  const headingFocus = () => requestAnimationFrame(() => document.getElementById("prototype-entry-title")?.focus({ preventScroll: true }));
  const switchEntry = (next: Entry) => {
    scrolls.current[entry] = body.current?.scrollTop ?? 0;
    setEntry(next); setChooser(false);
    requestAnimationFrame(() => { if (body.current) body.current.scrollTop = scrolls.current[next]; });
  };
  const pickQuestion = (question: QuestionId) => change({ ...context, question, names: false, role: null });
  const pickSeed = (anchor: EntitySummary, question: QuestionId) => { change({ ...context, anchor, question, role: null, q: "", names: false }); headingFocus(); };
  const pivot = (anchor: EntitySummary) => { change({ ...context, anchor, q: "", names: false }); headingFocus(); };
  const nameAlternative = () => change({ ...context, anchor: null, question: "connections", role: null, names: true });
  const showResults = () => {
    document.querySelector("[data-testid=prototype-keyword]")?.scrollIntoView({ block: "start" });
    document.getElementById("prototype-results-title")?.focus({ preventScroll: true });
  };
  const close = () => { dialog.current?.close(); launch.current?.focus({ preventScroll: true }); };
  const displayed = query.result ?? query.previous, blocked = query.loading || !!query.error;
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
  const claims = displayed?.claims.filter(c => !context.q.trim() || displayed.nodes.some(n => (n.id === c.subjectId || n.id === c.objectId) && n.id !== context.anchor?.id && normalize(n.name).includes(normalize(context.q.trim())))) ?? [];
  const candidates = new Map<string, { target: EntitySummary; claim: ClaimSummary }>();
  if (query.result?.anchor) for (const claim of query.result.claims) {
    const anchorId = query.result.anchor.id;
    const target = query.result.nodes.find(node => node.id === (claim.subjectId === anchorId ? claim.objectId : claim.subjectId));
    if (target && (!candidates.has(target.id) || (claim.contribution?.roleId && !candidates.get(target.id)!.claim.contribution?.roleId))) candidates.set(target.id, { target, claim });
  }
  const nextTargets = [...candidates.values()].slice(0, 4);
  const trail = <div className={styles.trail} data-testid="prototype-next-targets"><p className={styles.trailAnchor}>{context.anchor?.name}<span>{t("の記録から、次の接点へ", " → the next connection")}</span></p>
    <div className={styles.targetChoices}>{nextTargets.map(({ target, claim }) => <button key={target.id} onClick={() => pivot(target)}><strong>{target.name}</strong><small>{t("記録の一例：", "Example record: ")}{qualificationLabel(claim, locale) ?? explorationLabels(locale).predicates[claim.predicate]} · {polarityLabel(claim, locale)}</small><Icon name="arrow"/></button>)}</div>
    <p className={styles.note}>{query.loading ? t("次の接点を確認中…", "Checking next connections…") : nextTargets.length ? t("取得したページからの候補。選ぶと起点・名前絞込を置換し、関係と役割を保ちます。", "Candidates from the fetched page. Choosing replaces the start and name filter, keeping relation and role.") : t("この条件で次の接点を確認できません。問いを変えるか、範囲を広げられます。", "No next connections verified for these conditions. Change the question or broaden it.")}</p>{query.result && <button className={styles.jumpResults} onClick={showResults}>{t(`このページの記録 ${query.result.claims.length}件を見る`, `Read ${query.result.claims.length} records on this page`)} ↓</button>}</div>;
  const graphHref = (id: string) => (en ? "/en" : "") + explorationHref({
    version: 1, dataset: "public-kg", id, rootId: id, title: "Discovery prototype", savedAt: "2000-01-01T00:00:00.000Z",
    conditions: { predicates: plan.state === "ready" && plan.operation === "neighbors" && plan.predicate ? [plan.predicate] : null, contributionRoles: context.role ? [context.role] : null, organizationPositions: null, eventRoles: null },
    branches: [{ id, open: true, pages: 1 }], view: null,
  });
  const graphLabel = context.role ? contributionLabels(locale).roles[context.role] : textOf(questionNames[context.question], locale);
  const chips = [
    ...(context.world ? [{ key: "world", label: textOf(worldNames[context.world], locale), remove: () => change({ ...context, world: null }) }] : []),
    ...(context.question !== "connections" ? [{ key: "question", label: textOf(questionNames[context.question], locale), remove: () => change({ ...context, question: "connections", role: null }) }] : []),
    ...(context.anchor ? [{ key: "anchor", label: context.anchor.name, remove: () => change({ ...context, anchor: null }) }] : []),
    ...(context.role ? [{ key: "role", label: contributionLabels(locale).roles[context.role], remove: () => change({ ...context, role: null }) }] : []),
    ...(context.names ? [{ key: "names", label: t("名前検索（世界の分類なし）", "Name search (no world filter)"), remove: () => change({ ...context, names: false }) }] : []),
  ];
  return <main className={styles.page}>
    <p className={styles.eyebrow}>PLUNODE / DISCOVERY LAB</p><h1>{t("探索の入口を試す", "Try a new way to discover")}</h1>
    <p>{t("同じ探索文脈で、二つの入口を行き来する操作試作です。", "An interactive prototype with two entrances and one shared exploration context.")}</p>
    <button ref={launch} onClick={() => { dialog.current?.showModal(); document.getElementById("prototype-title")?.focus({ preventScroll: true }); }}>{t("試作を開く", "Open prototype")}</button> <a href={localizedPublicHref("/", locale)}>{t("Home・現在の検索へ", "Home & current search")}</a>
    <dialog ref={dialog} className={styles.dialog} onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="prototype-title">
      <header className={styles.header}><div><span className={styles.eyebrow}>DISCOVERY LAB / 01</span><h2 id="prototype-title" tabIndex={-1}>{t("次の発見へ。", "Follow your curiosity.")}</h2></div>
        <div className={styles.headerActions}><select aria-label={t("表示言語", "Language")} value={locale} onChange={e => setLocale(e.target.value as "ja" | "en")}><option value="ja">日本語</option><option value="en">English</option></select><button aria-label={t("試作を閉じる", "Close prototype")} onClick={close}><Icon name="close"/></button></div></header>
      <div className={styles.summary} aria-label={t("選択要約", "Selection summary")}>
        <div className={styles.chips}>{chips.map(chip => <button key={chip.key} onClick={() => { chip.remove(); requestAnimationFrame(() => document.getElementById("prototype-summary-note")?.focus({ preventScroll: true })); }} aria-label={t(`${chip.label}を外す`, `Remove ${chip.label}`)}>{chip.label}<Icon name="close"/></button>)}{!chips.length && <span>{t("気になる接点や世界を、まずひとつ。", "Start with a connection or a world that interests you.")}</span>}</div>
        <div className={styles.summaryMeta}><span id="prototype-summary-note" tabIndex={-1}>{t("世界は関心の印。検索の分類条件ではありません。", "Worlds mark your interests; they do not filter the data.")}</span><button disabled={!undo} onClick={() => { if (undo) { setContext(undo); setUndo(null); setCursors([null]); } }}>{t("一つ戻す", "Undo")}</button>{chips.length > 0 && <button onClick={() => change(initialContext)}>{t("広げ直す", "Start fresh")}</button>}</div>
      </div>
      <div ref={body} className={styles.body} data-testid="prototype-body">
        <div className={styles.presentation}><span>{t("入口の表示を比較", "Compare entrance layouts")}</span><div aria-label={t("表示方式", "Layout")}><button aria-pressed={variant === "staged"} onClick={() => { setVariant("staged"); setChooser(false); }}>{t("段階表示", "Staged")}</button><button aria-pressed={variant === "tabs"} onClick={() => { setVariant("tabs"); setChooser(false); }}>{t("二タブ", "Two tabs")}</button></div><span className={styles.badge}>{t("操作試作", "Prototype")}</span></div>
        {variant === "tabs" ? <div className={styles.tabs} role="tablist" aria-label={t("探索の入口", "Discovery entrances")}>{(["connections", "worlds"] as const).map(value => <button key={value} role="tab" id={`prototype-tab-${value}`} aria-controls="prototype-entry" aria-selected={entry === value} tabIndex={entry === value ? 0 : -1} onClick={() => switchEntry(value)} onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? "connections" : e.key === "End" ? "worlds" : entry === "connections" ? "worlds" : "connections"; switchEntry(next); document.getElementById(`prototype-tab-${next}`)?.focus({ preventScroll: true }); } }}>{value === "connections" ? t("今ある接点から", "Existing connections") : t("知識世界から", "Knowledge worlds")}</button>)}</div>
          : <div className={styles.stageNav}><span>{entry === "connections" ? t("01 / 今ある接点から", "01 / Existing connections") : t("02 / 知識世界から", "02 / Knowledge worlds")}</span><button aria-expanded={chooser} onClick={() => setChooser(v => !v)}>{t("入口を切り替える", "Change entrance")} <Icon name="arrow"/></button></div>}
        {chooser && <div className={styles.entranceChoices}>{(["connections", "worlds"] as const).map(value => <button key={value} aria-pressed={entry === value} onClick={() => { switchEntry(value); headingFocus(); }}>{value === "connections" ? t("今ある接点から", "Existing connections") : t("知識世界から", "Knowledge worlds")}<small>{value === "connections" ? t("公開記録を足場に、ひとつ先へ。", "Take one more step through published records.") : t("まだ知らない領域にも、問いを持つ。", "Bring a question to an unfamiliar world.")}</small></button>)}</div>}
        <section id="prototype-entry" role={variant === "tabs" ? "tabpanel" : undefined} aria-labelledby={variant === "tabs" ? `prototype-tab-${entry}` : "prototype-entry-title"} className={styles.entry}>
          <div className={styles.sectionHeading}><h3 id="prototype-entry-title" tabIndex={-1}>{entry === "connections" ? t("ひとつの接点から、世界が広がる。", "One connection opens another world.") : context.world && worldDetails ? textOf(worldNames[context.world], locale) : t("どの世界が気になりますか。", "Which world draws you in?")}</h3>{entry === "worlds" && context.world && worldDetails && <button onClick={() => { setWorldDetails(false); headingFocus(); }}>{t("11の世界へ戻る", "Back to 11 worlds")}</button>}</div>
          {entry === "connections" ? <>
            <p className={styles.note}>{plan.state === "unsupported" ? t("この問いに合う接点提案は未対応です。以下は、起点・問い・役割・名前の絞込を置き換える別案です。", "Suggestions for this question are unavailable. These alternatives replace the starting point, question, role and name filter.") : t("公開KGで確認した記録から。選ぶと起点・問いを置換し、役割・名前の絞込を解除します。", "Checked against the public KG. Choosing replaces the starting point and question, and clears role and name filters.")}</p>
            {context.anchor && plan.state === "ready" && plan.operation === "neighbors" ? <>{trail}<details className={styles.roles}><summary>{t("別の足場に切り替える", "Switch to another starting example")}</summary><div className={styles.seeds}>{prototypeSeeds.map(seed => <Seed key={seed.id} seed={seed} onChoose={pickSeed}/>)}</div></details></> : <div className={styles.seeds}>{prototypeSeeds.map(seed => <Seed key={seed.id} seed={seed} onChoose={pickSeed}/>)}</div>}
          </> : context.world && worldDetails ? <>
            <p className={styles.note}>{t("世界全体の収録状況は未確認 · この画面では正式な収集予定を確認していません。", "World-wide coverage is unassessed · No formal collection schedule is verified here.")}</p>
            <div className={styles.questions}>{questionsForWorld[context.world].map(question => <button key={question} aria-pressed={context.question === question && !context.names} onClick={() => pickQuestion(question)}><span>{textOf(questionNames[question], locale)}</span><small>{questionPredicates[question] ? t("起点を選んで一段探索", "One step from a starting entity") : t("問いを開いて対応状況を見る", "Open question to see availability")}</small><Icon name="arrow"/></button>)}</div>
            <p className={styles.note}>{t("問いの切替は関係を置換し、制作役割の限定を解除します。起点と世界の関心は保ちます。", "Changing the question replaces the relation and clears the production role. The starting point and interests stay.")}</p>
          </> : <div className={styles.worlds}>{WORLD_IDS.map((world, index) => <button key={world} data-world={world} aria-pressed={context.world === world} onClick={() => { change({ ...context, world }); setWorldDetails(true); headingFocus(); }}><small>{String(index + 1).padStart(2, "0")}</small><strong>{textOf(worldNames[world], locale)}</strong><span>{t("問いをひらく", "Explore questions")} ↗</span></button>)}</div>}
        </section>
        <section className={styles.next} aria-label={t("次の一手", "Next steps")}>
          <div className={styles.sectionHeading}><h3>{t("ここから、どう辿る？", "Where next?")}</h3>{context.anchor && <span>{context.anchor.name}</span>}</div>
          {entry === "worlds" && context.anchor && plan.state === "ready" && plan.operation === "neighbors" && trail}
          {plan.state === "unsupported" ? <div className={styles.unavailable} data-testid="prototype-unsupported"><strong>{t("検索方式が未対応", "Search method unsupported")}</strong><p>{textOf(plan.reason, locale)}</p><p>{t("収録状況：未確認。検索を実行していないため、0件とは判定していません。", "Coverage: unassessed. This search was not executed; it is not a zero-result search.")}</p><button onClick={nameAlternative}>{t("起点・問いを置換し、分類なしの名前検索へ", "Replace start & question with an unclassified name search")}</button>{context.role && <button onClick={() => change({ ...context, role: null })}>{t("制作役割だけを外す", "Remove only the production role")}</button>}</div>
            : <><div className={styles.nextChoices}>{(["credits", "affiliations", "influences"] as const).map(question => <button key={question} aria-pressed={context.question === question && !context.names} onClick={() => pickQuestion(question)}>{textOf(questionNames[question], locale)}</button>)}<button aria-pressed={context.names} onClick={nameAlternative}>{t("起点・問いを外して名前から", "Replace start & question with a name")}</button></div>
              <p className={styles.note}>{t("問いの切替は関係を置換・役割限定を解除。「先へ」は起点と名前絞込を置換し、関係・役割を保ちます。", "Changing question replaces the relation and clears the role. Continuing changes the starting point, clears the name filter and keeps relation/role.")}</p>
              {context.question === "credits" && !context.names && <details className={styles.roles}><summary>{t("制作上の役割を見比べる", "Compare production roles")}</summary><div className={styles.nextChoices}><button aria-pressed={!context.role} onClick={() => change({ ...context, role: null })}>{t("役割を限定しない", "Any role")}</button>{CONTRIBUTION_ROLE_IDS.map(role => <button key={role} aria-pressed={context.role === role} onClick={() => change({ ...context, role: context.role === role ? null : role })}>{contributionLabels(locale).roles[role]}</button>)}</div></details>}
              {plan.state === "needs-anchor" && entry === "worlds" && <div className={styles.needs}><p>{t("まず、記録を辿る起点を選んでください。", "Choose a starting entity to follow its records.")}</p><div className={styles.seeds}>{prototypeSeeds.filter(seed => !context.world || seed.world === context.world || context.world === "history").map(seed => <Seed key={seed.id} seed={seed} onChoose={pickSeed}/>)}</div><p className={styles.note}>{t("起点例を選ぶと、そのカードの問いへ切り替わります。別の対象は名前から探せます。", "A starting example also switches to its stated question. Find other entities by name.")}</p></div>}
            </>}
        </section>
        <section className={styles.matches} aria-label={t("探索結果", "Discovery results")} aria-busy={query.loading}>
          <form className={styles.keyword} data-testid="prototype-keyword" onSubmit={e => { e.preventDefault(); query.retry(); }}>
            <label htmlFor="prototype-name">{context.names ? t("名前・別名（任意の世界分類は適用しません）", "Name or alias (without world classification)") : t("このページの相手の名前を絞る（任意・別名は対象外）", "Filter connected names on this page (optional; no aliases)")}</label><div><Icon name="search"/><input id="prototype-name" value={context.q} maxLength={100} placeholder={t("名前を知っているときに", "When you have a name in mind")} onChange={e => change({ ...context, q: e.target.value })} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}/>{context.q && <button type="button" onClick={() => change({ ...context, q: "" })}>{t("消去", "Clear")}</button>}</div>
          </form>
          <div className={styles.resultHeading}><h3 id="prototype-results-title" tabIndex={-1}>{t("記録と、次の接点", "Records & next connections")}</h3><span role="status">{query.loading ? t("公開記録を確認中…", "Checking published records…") : query.result ? context.names ? t(`名前の一致 ${query.result.items.length}件`, `${query.result.items.length} name matches`) : t(`このページ ${claims.length}件の主張`, `${claims.length} claims on this page`) : ""}</span></div>
          {query.error && <div role="alert" className={styles.unavailable}><p>{query.conflict ? t("公開KGの版が変わりました。先頭から再取得してください。", "The public KG changed. Refresh from the first page.") : t("記録を取得できませんでした。通信や公開APIの状態を確認して再試行してください。", "Records could not be loaded. Check the connection and retry.")}</p><button onClick={() => { setCursors([null]); query.retry(); }}>{t("先頭から再取得", "Refresh from first page")}</button></div>}
          {plan.state !== "ready" ? <div className={styles.empty}>{plan.state === "needs-name" ? t("名前を入力すると、現在の公開KGから候補を探します。", "Enter a name to search the current public KG.") : plan.state === "unsupported" ? t("この問いは未実行です。上の別案を選ぶか、問いを切り替えて続けられます。", "This question was not executed. Choose an alternative above to continue.") : t("入口や問いを選ぶと、ここに実際の記録が届きます。", "Choose a starting point to see actual records here.")}</div>
            : <div className={styles.resultStage} data-testid="prototype-results" data-updating={blocked || undefined}><div inert={blocked} aria-hidden={blocked || undefined}>
              {displayed && context.names && displayed.items.map(entity => <div className={styles.nameRow} key={entity.id}><div><strong>{entity.name}</strong><p>{entity.description}</p></div><button onClick={() => pivot(entity)}>{t("この対象の接点へ", "Follow connections")}</button><a href={graphHref(entity.id)}>Graph ↗</a></div>)}
              {displayed?.anchor && !context.names && claims.map(claim => <ClaimRow key={`${displayed.revision}:${claim.id}`} claim={claim} nodes={displayed.nodes} anchor={displayed.anchor!} revision={displayed.revision} onPivot={pivot}/>)}
              {query.result && (context.names ? !query.result.items.length : !claims.length) && <div className={styles.empty}><strong>{t("この条件・取得範囲では該当なし", "No match in this request's scope")}</strong><p>{t("世界全体にデータがないことは意味しません。名前や役割を外すか、別の起点を試せます。", "This does not mean the whole world has no data. Remove a name/role filter or try another starting point.")}</p>{context.q && <button onClick={() => change({ ...context, q: "" })}>{t("名前の絞込だけ外す", "Remove only the name filter")}</button>}{context.role && <button onClick={() => change({ ...context, role: null })}>{t("役割だけ外す", "Remove only the role")}</button>}</div>}
              {displayed?.anchor && !context.names && <a className={styles.graphLaunch} data-testid="prototype-graph" href={graphHref(displayed.anchor.id)}><Icon name="graph"/>{t(`${displayed.anchor.name}をGraphで開く`, `Open ${displayed.anchor.name} in Graph`)}<small>{graphLabel}</small><Icon name="arrow"/></a>}
            </div>{query.loading && !displayed && <div className={styles.skeleton} aria-hidden="true"/>}</div>}
          {plan.state === "ready" && plan.operation === "neighbors" && <nav className={styles.pagination} aria-label={t("記録のページ", "Record pages")}><button disabled={blocked || cursors.length === 1} onClick={() => { setCursors(v => v.slice(0, -1)); showResults(); }}>{t("前のページ", "Previous page")}</button><span>{t(`${cursors.length}ページ`, `Page ${cursors.length}`)}</span><button disabled={blocked || !query.result?.nextCursor} onClick={() => { setCursors(v => [...v, query.result!.nextCursor]); showResults(); }}>{t("次の記録", "Next records")}</button></nav>}
          {query.result?.hasMore && <p className={styles.note}>{context.names ? t("続きがあります。名前を具体的にすると候補を絞れます。", "More names match. Refine the name to narrow the candidates.") : t("未取得の続きがあります。名前の絞込は取得中のページだけに適用します。", "More records are available. The name filter applies only to the current page.")}</p>}
          <p className={styles.note}>{t("両方向の一段探索です。元の記録も含みます。共通の所属先は、同時在籍・交流・共同研究の証明ではありません。", "One step in both directions, including the record you came from. A shared institution does not prove simultaneous affiliation, contact or collaboration.")}</p>
          <p className={styles.note}>{t("Graphへは関係・役割を引き継ぎます。世界・名前の絞込は引き継ぎません。自動連鎖・期間条件は未対応です。", "Graph carries relation and role filters, not world interests or names. Automatic chains and period filters are unsupported.")}</p>
          {query.result && <p className={styles.revision}>PUBLIC KG · {query.result.revision}</p>}
        </section>
      </div>
    </dialog>
  </main>;
}
