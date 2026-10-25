"use client";
import { useEffect, useState } from "react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import AiLabAvatar from "./AiLabAvatar";
import AiProfileLinks from "./AiProfileLinks";
import PageIdentity from "./PageIdentity";
import { useUiLocale } from "../lib/client/ui-locale";
import { localizedPublicHref } from "../lib/domain/public-routes";
import { labCounts, type LabArtifact, type LabRun } from "../lib/domain/ai-lab";
import { rememberLabDeparture, restoreLabRecord } from "../lib/client/ai-lab-navigation";
import styles from "./AiLab.module.css";

const taskTitles = {
  "pluto-supervisor": ["PLUTOの監修を、根拠から辿る", "Follow evidence for PLUTO’s supervisor"],
  "pluto-no-outgoing": ["指定した方向に、経路がないとき", "When the requested direction has no path"],
  "pluto-limited": ["まだ候補を取り終えていないとき", "When candidate retrieval is incomplete"],
  "pluto-other-work": ["著者を介して、別の作品へ", "Find another work through its author"],
};
const roleTitles: Record<string, [string,string]> = { AUTHORSHIP: ["著者", "Authorship"], SUPERVISION: ["監修", "Supervision"], PRODUCING: ["プロデュース", "Producing"] };

export default function AiLab({ artifact }: { artifact: LabArtifact | null }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [selected,setSelected] = useState(""), [filter,setFilter] = useState("all");
  useEffect(() => {
    const sync = () => { const p = new URLSearchParams(location.search); setSelected(p.get("run") || ""); setFilter(["baseline","held","inference"].includes(p.get("filter") || "") ? p.get("filter")! : "all"); };
    const frame = requestAnimationFrame(sync); addEventListener("popstate",sync);
    return () => { cancelAnimationFrame(frame); removeEventListener("popstate",sync); };
  },[]);
  useEffect(() => { const frame = requestAnimationFrame(restoreLabRecord); return () => cancelAnimationFrame(frame); },[selected,filter]);
  const local = (url: string) => localizedPublicHref(url,locale);
  const date = (value: string) => new Date(value).toLocaleString(en ? "en-GB" : "ja-JP", { timeZone:"Asia/Tokyo",hour12:false }) + " JST";
  function select(run: string, nextFilter = filter) {
    const params = new URLSearchParams(); if (run) params.set("run",run); if (nextFilter !== "all") params.set("filter",nextFilter);
    history.pushState(history.state,"",local("/ai-lab")+(params.size?"?"+params:"")+"#records"); setSelected(run); setFilter(nextFilter);
  }
  if (!artifact) return <><SiteHeader dataset="public-kg" page="ai-lab"/><main className={styles.main}><h1>{en?"AI Lab":"AI育成ラボ"}</h1><p role="alert">{en?"Saved records are temporarily unavailable. Please try again later.":"保存済みの記録を取得できません。時間をおいて再度ご確認ください。"}</p><a href={local("/")}>{en?"Return to exploration":"探索へ戻る"}</a></main></>;
  const data = artifact.payload, counts = labCounts(data), names = new Map(data.entities.map(e => [e.id,e.name]));
  const runs = [...data.runs].sort((a,b) => Date.parse(b.startedAt)-Date.parse(a.startedAt));
  const visible = runs.filter(r => filter === "all" || filter === "baseline" && r.executionKind === "rule" || filter === "held" && r.status === "held");
  const run = runs.find(r => r.runId === selected);
  const kind = (r: LabRun) => r.executionKind === "rule" ? en?"Non-AI comparison":"非AIの比較" : en?"Held before inference":"推論前の保留";
  const choice = (r: LabRun) => r.choice === null ? en?"No AI inference was sent":"AIへの推論要求は未送信" : r.choice === "STOP" ? en?"Stopped within the fixed subset":"固定範囲で停止" : r.choice === "HOLD" ? en?"Held because retrieval was incomplete":"取得未完了のため判断を保留" : names.get(r.paths.find(p => p.id === r.choice)?.targetId || "") || "—";
  return <><SiteHeader dataset="public-kg" page="ai-lab"/><main className={styles.main} data-ai-lab>
    <header className={styles.pageHeading} id="apprentice"><PageIdentity area="ai-lab"/><h1>{en?"AI Lab":"AI育成ラボ"}</h1></header>
    <header className={styles.hero} data-testid="explorer-apprentice" data-ai-id={data.aiId}>
      <AiLabAvatar/>
      <div><h2>{en?"Apprentice exploration AI":"探索者見習いAI"}</h2><p className={styles.introduction}>{en?"A new explorer, at the very beginning. Follow its choices and evidence as its story grows.":"生まれたばかりの、小さな探索者。選択と根拠を辿りながら、これからの変化を見守ります。"}</p></div>
      <div className={styles.stage}><small>{en?"CURRENT STAGE":"現在の段階"}</small><strong>{en?"Before its first outing":"まだ、最初の出動前"}</strong><span>{en?"No additional training":"追加学習なし"}</span><span>{en?"Live activity is not monitored":"実際の活動状態は未監視"}</span></div>
    </header>
    <AiProfileLinks/>
    <section className={styles.metrics} aria-label={en?"Recorded AI activity":"記録されたAIの活動"}>{[[counts.inference,en?"AI inference runs":"AI実推論"],[counts.training,en?"Additional training runs":"追加学習"]].map(([n,label])=><div key={label}><strong data-testid={n===counts.inference&&label===(en?"AI inference runs":"AI実推論")?"inference-count":"training-count"}>{n}</strong><span>{label}</span></div>)}</section>
    <section className={styles.beginning}><p className={styles.eyebrow}>{en?"FROM THE BEGINNING":"ここから始まる"}</p><h2>{en?"The first page is still blank.":"最初の一歩は、これから。"}</h2><p>{en?"The apprentice has not run real AI inference or received additional training in this lab. We will keep evidence of what it chooses, where it pauses and how its versions change.":"見習いは、まだ実推論も、このラボでの追加学習も行っていません。何を選び、どこで立ち止まり、版がどう変わったのか。その記録を根拠とともに残していきます。"}</p><p className={styles.muted}>{en?"Its gentle floating is visual presentation, not a signal of live AI activity.":"見習いの浮遊は表示上の演出で、実際のAI活動を示すものではありません。"}</p></section>
    <section className={styles.comparison}><div><p className={styles.eyebrow}>{en?"PREPARATION NOTES":"準備の観察ノート"}</p><h2>{en?"Same person, different evidence.":"同じ人物でも、根拠は違う。"}</h2><p>{en?"Two ordinary-code policies chose Makoto Tezuka. The later policy used the Claim with an explicit supervision credit. This is a non-AI policy comparison; it is not model learning or an approved accuracy score.":"2つの通常コードの方針は、ともに手塚眞を選びました。後の方針は、監修を明示するClaimを選びました。非AIの方針比較であり、モデルの学習や承認済みの正解率ではありません。"}</p></div><div className={styles.versionPair}>{[["7948fb59-7a97-4fe0-a49a-25a5cc538492","id-order-v1",en?"Role unspecified":"Role未指定"],["41cd2d6f-e9b5-49ef-9cc9-ede5077d6a59","purpose-role-v1",en?"Supervision credit":"監修の明示あり"]].map(([id,version,label])=><button key={id} onClick={()=>{select(id,"baseline");document.getElementById("records")?.scrollIntoView();}}><small>{version}</small><strong>{label}</strong><span>{en?"Read the record →":"記録を読む →"}</span></button>)}</div></section>
    <section id="records" className={styles.records} aria-label={en?"Preparation and comparison records":"準備と比較の記録"}>
      <div className={styles.heading}><div><h2>{en?"Preparation and comparison records":"準備と比較の記録"}</h2><p>{en?`${counts.baseline} non-AI comparisons · ${counts.held} attempts held before inference`:`非AI比較 ${counts.baseline}件 · 推論前の保留 ${counts.held}件`}</p></div><label>{en?"Show":"表示"} <select value={filter} onChange={e=>select("",e.target.value)}><option value="all">{en?"All":"すべて"}</option><option value="baseline">{en?"Non-AI comparisons":"非AIの比較"}</option><option value="held">{en?"Held before inference":"推論前の保留"}</option><option value="inference">{en?"AI inference":"AI実推論"}</option></select></label></div>
      <p className={styles.muted}>{en?"These preparation records are separate from the apprentice’s future AI exploration and training results.":"準備段階の記録です。見習い自身によるAI探索の成功・学習成果とは分けて表示しています。"}</p>
      <div className={styles.runLayout}><div className={styles.runList}>{visible.length===0&&<p>{en?"No AI inference records yet.":"AIの実推論記録はまだありません。"}</p>}{visible.map(r=><button className={styles.run} data-testid="lab-run" key={r.runId} aria-pressed={selected===r.runId} onClick={()=>select(r.runId)}><small>{kind(r)}</small><strong>{taskTitles[r.taskId][en?1:0]}</strong><span>{choice(r)}</span><time>{date(r.startedAt)}</time></button>)}</div>
      <article className={styles.detail} aria-live="polite">{run?<><p className={styles.eyebrow}>{kind(run)}</p><h3>{taskTitles[run.taskId][en?1:0]}</h3><p><strong>{choice(run)}</strong></p>{run.status==="held"&&<p>{en?"The request was held before transmission. There is no AI choice or model probability in this record.":"リクエスト送信前に保留しました。この記録にAIの選択結果・モデル確率はありません。"}</p>}
        {run.choice==="STOP"&&<p>{en?"No eligible path was found in the fully retrieved fixed subset. This does not mean no such relation exists elsewhere.":"取得を終えた固定部分集合内に該当経路がありません。ほかの範囲に関係が存在しないという意味ではありません。"}</p>}
        {run.choice==="HOLD"&&<p>{en?"Retrieval was incomplete, so absence could not be concluded.":"取得が未完了のため、経路がないとは判断していません。"}</p>}
        {run.paths.filter(p=>p.id===run.choice).map(p=><div key={p.id}><h4>{en?"Selected path and evidence":"選んだ経路と根拠"}</h4><ol className={styles.path}>{p.steps.map(step=><li key={step.claimId}><strong>{names.get(step.fromId)} → {names.get(step.toId)}</strong><p>{step.contribution?.roleId?roleTitles[step.contribution.roleId]?.[en?1:0]||step.contribution.roleId:en?"Role unspecified":"Role未指定"}{step.contribution?.scope&&<> · {step.contribution.scope.volumeLabel} / ISBN {step.contribution.scope.isbn13}</>}</p><a href={local("/")+"?read=claim&dataset=public-kg&id="+step.claimId} onClick={()=>rememberLabDeparture(local("/")+"?read=claim&dataset=public-kg&id="+step.claimId)}>{en?"Read Claim and evidence →":"Claimと根拠を読む →"}</a></li>)}</ol><a href={local("/explore/"+p.targetId)} onClick={()=>rememberLabDeparture(local("/explore/"+p.targetId))}>{en?"Open the current Graph →":"現在のGraphで開く →"}</a></div>)}
        <details className={styles.provenance}><summary>{en?"Versions and provenance":"版と記録の由来"}</summary><dl><dt>{en?"Policy":"探索方針"}</dt><dd>{run.policyVersion}</dd><dt>{en?"Lab training":"ラボ追加学習"}</dt><dd>{en?"None":"なし"}</dd><dt>{en?"Evaluation":"評価"}</dt><dd>{en?"Development rubric awaiting human review":"開発用の採点案・人間確認待ち"}</dd><dt>KG</dt><dd>{data.kgRevision}</dd><dt>Code</dt><dd>{run.codeCommit}</dd><dt>Run / Parent</dt><dd>{run.runId}<br/>{run.parentRunId||"—"}</dd><dt>{en?"Policy disposition":"方針の採否記録"}</dt><dd>{run.disposition||"—"}</dd></dl><p>{en?"No approved correctness score is published. This rubric review is separate from opening the lab to visitors.":"承認済みの正解率は公開していません。採点案の確認は、ラボを公開する判断とは別に進めます。"}</p></details>
      </>:<p className={styles.muted}>{en?"Choose a record to inspect its evidence and versions.":"記録を選ぶと、根拠と版を確認できます。"}</p>}</article></div>
    </section>
    <footer className={styles.recordFooter}><p>{en?"Saved observations · last recorded attempt:":"保存済みの観察記録 · 最終試行："} <time>{date(data.recordedAt)}</time></p><details><summary>{en?"About this apprentice and these records":"見習いと記録について"}</summary><p>{en?"The apprentice and Plunode’s official AI are separate identities. Real mentoring comments are not available yet.":"探索者見習いとPlunode公式AIは別の個体です。実際の育成コメントはまだありません。"}</p><p>{en?"The lab records a fixed public KG subset. Graph and evidence links open the current public KG, whose revision may differ.":"ラボの記録は公開KGの固定部分集合に基づきます。Graph・根拠へのリンクは現在の公開KGを開くため、版が異なる場合があります。"}</p><p>{en?"No additional training means none in this lab; the base model itself was pretrained.":"追加学習なしは、このラボでの追加学習がないという意味です。基盤モデル自体の事前学習を否定しません。"}</p><code>AI ID: {data.aiId}<br/>Artifact: {artifact.sha256}<br/>Version: {data.version}</code></details></footer>
  </main><SiteFooter languagePath="/ai-lab"/></>;
}
