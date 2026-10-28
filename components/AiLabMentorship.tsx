import type {EducationMentorship} from '../lib/domain/ai-education-policy';
import type {LabArtifact} from '../lib/domain/ai-lab';
import {OFFICIAL_AI_ID,OFFICIAL_AI_KEY,profileHref} from '../lib/domain/public-profile';
import {localizedPublicHref} from '../lib/domain/public-routes';
import ProfileAvatar from './ProfileAvatar';
import styles from './AiLab.module.css';

export default function AiLabMentorship({mentorship,cycles,en}:{mentorship:EducationMentorship;cycles:NonNullable<LabArtifact['payload']['education']>['cycles'];en:boolean}){
  const locale=en?'en':'ja';
  const date=(value:string)=>new Date(value).toLocaleString(en?'en-GB':'ja-JP',{timeZone:'Asia/Tokyo',hour12:false})+' JST';
  const categories={direction:en?'Direction':'探索方向',evidence:en?'Evidence / HOLD':'根拠不足・HOLD',polarity:en?'Polarity':'肯定・否定',role:en?'Role':'役割',scope:en?'Scope':'範囲',period:en?'Period':'期間'};
  return <section id="mentorship" className={styles.education} data-official-ai-id={OFFICIAL_AI_ID} aria-label={en?'Education review and policy':'教育評価と方針'}>
    <p className={styles.eyebrow}>{en?'REVIEW AND NEXT POLICY':'教育の評価と次の方針'}</p><h2>{en?'What to teach next, and why.':'次に何を教えるか、根拠から。'}</h2>
    <p className={styles.mentorIdentity}><ProfileAvatar icon="official-ai" small compact/><a href={profileHref(OFFICIAL_AI_KEY,locale)}>{en?'Plunode official AI · education review':'Plunode公式AI・教育評価'}</a></p>
    <p>{en?'AI interpretation proposes a teaching policy. The local Worker checks its evidence, allowed fields and protected holdout before accepting it. Policy acceptance is separate from model adoption or semantic approval.':'AIによる解釈から教育方針を提案し、ローカルWorkerが根拠・許可項目・holdout保護を検査します。教育方針の採用は、モデル採用や意味評価の合格とは別です。'}</p>
    {[...mentorship.records].reverse().map(record=>{
      const plan=record.plan.payload,selection=record.selection;
      const later=cycles.filter(c=>c.educationPolicy?.planSha256===record.plan.sha256);
      return <article className={`${styles.detail} ${styles.mentorRecord}`} data-testid="mentor-review" key={record.reviewId}>
        <div className={styles.heading}><strong>{en?'AI evaluation · interactive Codex':'AIによる評価・対話内Codex'}</strong><time>{date(plan.createdAt)}</time></div>
        <p className={styles.muted}>{en?'An actual AI-authored review in this dialogue. This was not executed by a ChatGPT scheduled task.':'この対話でAIが実際に評価して作成した記録です。ChatGPT定期タスクによる評価ではありません。'}</p>
        <h3>{en?'Observed facts':'観測した事実'}</h3><ul>{plan.facts.map((fact,i)=><li key={i}>{fact[locale]}</li>)}</ul>
        <h3>{en?'Interpretation / hypotheses':'解釈・弱点の仮説'}</h3><ul>{plan.hypotheses.map((note,i)=><li key={i}>{note[locale]}</li>)}</ul>
        <h3>{en?'Next teaching policy':'次回の教育方針'}</h3><p>{plan.priorities.map(k=>categories[k]).join(' → ')} · {en?'Single edge':'1辺の課題'}</p>
        <p>{en?'Protect holdout · verify checkpoint reload · semantic review pending · no independent-final claim. At most one real cycle uses this proposal.':'holdoutを保護・checkpoint再読込を確認・意味評価は人間確認待ち・独立finalと呼ばない。この提案を使う実サイクルは最大1回です。'}</p>
        <h3>{en?'Worker decision':'Workerの採用判断'}</h3><p><strong>{en?'Accepted for train-category ordering only':'train課題のカテゴリ順に限り採用'}</strong></p>
        {selection?<p data-testid="mentor-selection">{en?'Verified next selection':'検証した次の選択'}: {categories[selection.baselineKind]} → <strong>{categories[selection.selectedKind]}</strong> · {en?'holdout unchanged; train/holdout disjoint. This selection check ran no model inference or learning.':'holdout不変・train/holdout分離。選択の検証では推論・学習を実行していません。'}</p>:<p>{en?'Selection has not been observed yet.':'次課題の選択はまだ観測していません。'}</p>}
        <p>{en?'Subsequent model verification':'後のモデル検証'}: {later.length?later.map(c=><a key={c.cycleId} href={localizedPublicHref('/ai-lab',locale)+'?cycle='+c.cycleId+'#education'}>{c.status} · {c.cycleId.slice(0,8)} </a>):en?'Not run; no new learning result is claimed.':'未実施。新たな学習成果として数えていません。'}</p>
        <details className={styles.provenance}><summary>{en?'Versions, evidence and exchange':'版・根拠・受け渡し'}</summary>
          <p><a href={record.reportTransport.url} target="_blank" rel="noopener noreferrer">{en?'GitHub report':'GitHubの実レポート'} ↗</a> · <a href={record.decision.transport.url} target="_blank" rel="noopener noreferrer">{en?'AI plan on GitHub':'GitHubのAI方針'} ↗</a></p>
          <ul>{plan.basedOn.map(ref=><li key={ref.cycleId}><a href={localizedPublicHref('/ai-lab',locale)+'?cycle='+ref.cycleId+'#education'}>{en?'Source cycle':'対象サイクル'} {ref.cycleId.slice(0,8)}</a><code>{ref.resultSha256}</code></li>)}</ul>
          <dl><dt>Plan / Version</dt><dd>{plan.planId}<br/>{plan.contract}</dd><dt>Report SHA</dt><dd>{record.report.sha256}</dd><dt>Plan SHA</dt><dd>{record.plan.sha256}</dd><dt>{en?'Selection code SHA':'選択コードSHA'}</dt><dd>{plan.selectionSourceSha256}</dd><dt>{en?'Accepted at':'採用判断日時'}</dt><dd>{date(record.decision.recordedAt)}</dd><dt>{en?'Expires at':'有効期限'}</dt><dd>{date(plan.expiresAt)}</dd></dl>
        </details>
      </article>;
    })}
    <p className={styles.muted}>{en?'GitHub reading and writing were verified for the local Worker and this interactive connection. ChatGPT scheduled execution and its GitHub permissions remain unverified; no daily evaluation schedule is registered.':'ローカルWorkerとこの対話のGitHub接続は読書きを確認済みです。ChatGPT定期実行の接続・権限は未検証で、日次評価は未登録です。'}</p>
  </section>;
}
