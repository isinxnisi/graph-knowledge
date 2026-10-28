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
        <div className={styles.heading}><strong>{en?'Official AI · review and teaching policy':'公式AI・見習いの評価と教育方針'}</strong><time>{date(plan.createdAt)}</time></div>
        <h3>{en?'Observed facts':'観測した事実'}</h3><ul>{plan.facts.map((fact,i)=><li key={i}>{fact[locale]}</li>)}</ul>
        <h3>{en?'Interpretation / hypotheses':'解釈・弱点の仮説'}</h3><ul>{plan.hypotheses.map((note,i)=><li key={i}>{note[locale]}</li>)}</ul>
        <h3>{en?'Next teaching policy':'次回の教育方針'}</h3><p>{plan.priorities.map(k=>categories[k]).join(' → ')} · {en?'Single edge':'1辺の課題'}</p>
        <p>{en?'Protect holdout · verify checkpoint reload · semantic review pending · no independent-final claim. At most one real cycle uses this proposal.':'holdoutを保護・checkpoint再読込を確認・意味評価は人間確認待ち・独立finalと呼ばない。この提案を使う実サイクルは最大1回です。'}</p>
        <h3>{en?'Worker decision':'Workerの採用判断'}</h3><p><strong>{en?'Accepted for train-category ordering only':'train課題のカテゴリ順に限り採用'}</strong></p>
        {selection?<p data-testid="mentor-selection">{en?'Verified next selection':'検証した次の選択'}: {categories[selection.baselineKind]} → <strong>{categories[selection.selectedKind]}</strong> · {en?'holdout unchanged; train/holdout disjoint. This selection check ran no model inference or learning.':'holdout不変・train/holdout分離。選択の検証では推論・学習を実行していません。'}</p>:<p>{en?'Selection has not been observed yet.':'次課題の選択はまだ観測していません。'}</p>}
        <p>{en?'Subsequent model verification':'後のモデル検証'}: {later.length?later.map(c=><a key={c.cycleId} href={localizedPublicHref('/ai-lab',locale)+'?cycle='+c.cycleId+'#education'}>{c.status} · {c.cycleId.slice(0,8)} </a>):en?'Not run; no new learning result is claimed.':'未実施。新たな学習成果として数えていません。'}</p>
        <details className={styles.provenance}><summary>{en?'Versions, evidence and exchange':'版・根拠・受け渡し'}</summary>
          <p>{plan.method==='interactive-codex'?(en?'Execution source: interactive Codex. This historical review was not a ChatGPT scheduled execution.':'技術的な出所：対話内Codex。この過去の評価はChatGPT定期実行によるものではありません。'):(en?'Execution source: ChatGPT scheduled proposal, normalized and sealed locally.':'技術的な出所：ChatGPT scheduledの提案をローカルで正規化・封印。')}</p>
          {record.decision.executionEvidence&&<p>{record.decision.executionEvidence.basis==='operator-attested-run'?(en?'The operator attested this actual scheduled plan run.':'この実方針を作成した定期実行は運営者が確認済みです。'):(en?'Received through the registered GitHub owner/task channel. This individual cloud run was not independently attested.':'登録済みのGitHub投稿者・タスク経路から受信。この個別クラウド実行の出所は独立に証明していません。')} <a href={record.decision.executionEvidence.registrationEvidenceUrl} target="_blank" rel="noopener noreferrer">{en?'Registration evidence':'経路登録時の証跡'} ↗</a></p>}
          <p><a href={record.reportTransport.url} target="_blank" rel="noopener noreferrer">{en?'GitHub report':'GitHubの実レポート'} ↗</a> · <a href={record.decision.transport.url} target="_blank" rel="noopener noreferrer">{en?'AI plan on GitHub':'GitHubのAI方針'} ↗</a></p>
          <ul>{plan.basedOn.map(ref=><li key={ref.cycleId}><a href={localizedPublicHref('/ai-lab',locale)+'?cycle='+ref.cycleId+'#education'}>{en?'Source cycle':'対象サイクル'} {ref.cycleId.slice(0,8)}</a><code>{ref.resultSha256}</code></li>)}</ul>
          <dl><dt>Plan / Version</dt><dd>{plan.planId}<br/>{plan.contract}</dd><dt>Report SHA</dt><dd>{record.report.sha256}</dd><dt>Plan SHA</dt><dd>{record.plan.sha256}</dd><dt>{en?'Selection code SHA':'選択コードSHA'}</dt><dd>{plan.selectionSourceSha256}</dd><dt>{en?'Accepted at':'採用判断日時'}</dt><dd>{date(record.decision.recordedAt)}</dd><dt>{en?'Expires at':'有効期限'}</dt><dd>{date(plan.expiresAt)}</dd></dl>
        </details>
      </article>;
    })}
    {mentorship.operation&&<div className={styles.detail} data-testid="education-operation">
      <h3>{en?'Education operation · saved observation':'教育の運転・保存時点の観測'}</h3>
      <p>{en?'Local CPU Worker':'ローカルCPU Worker'}: {mentorship.operation.enabled?(en?'enabled':'有効'):(en?'paused':'延期中')} · {mentorship.operation.workerObserved?(en?'process observed':'プロセス確認済み'):(en?'process not observed':'プロセス未確認')}</p>
      <p>{mentorship.operation.windowStart}–{mentorship.operation.windowEnd} JST · {en?`at most ${mentorship.operation.dailyMax} real cycle per day`:`実サイクルは1日最大${mentorship.operation.dailyMax}回`} · CPU 2 / RAM 6 GiB</p>
      <p>{mentorship.operation.scheduledChannel==='registered'?(en?'The teaching-policy input channel is registered.':'教育方針の受入口は登録済みです。'):(en?'Waiting for the first scheduled teaching plan and its execution attestation.':'最初の定期教育方針と、その実行証跡の確認を待っています。')}</p>
      <p className={styles.muted}>{en?'A saved observation, not live monitoring. PC/WSL sleep stops local education and beta delivery.':'保存時点の観測で、リアルタイム監視ではありません。PC・WSLの停止中はローカル教育とbeta配信が止まります。'}</p>
    </div>}
    <p className={styles.muted}>{mentorship.capabilities.chatgptScheduled==='not-verified'?(en?'This historical artifact has no verified scheduled connection.':'この過去のartifactでは定期実行の接続は未検証です。'):(en?'Scheduled GitHub reading/writing was verified; this alone does not demonstrate daily teaching.':'定期実行からGitHubの読書きは確認済みです。それだけで日次教育の成立を示すものではありません。')} {en?'Daily cloud evaluation settings have not been inspected by this Worker.':'クラウドの日次評価設定は、このWorkerからは未確認です。'}</p>
  </section>;
}
