import {z} from 'zod';
const hash=z.string().regex(/^[a-f0-9]{64}$/),commit=z.string().regex(/^[a-f0-9]{40}$/),stamp=z.iso.datetime({offset:true});
const kind=z.enum(['direction','evidence','polarity','role','scope','period']);
const choice=z.enum(['C0','STOP','HOLD']);
const count=z.number().int().nonnegative().max(1000);
const ref=z.strictObject({cycleId:z.uuidv4(),resultSha256:hash});
const limits=z.strictObject({ramMiB:z.literal(6144),cpus:z.literal(2),wallSeconds:z.literal(180),outputMiB:z.literal(256)});
const reportCycle=ref.extend({codeCommit:commit,sourceSha256:hash,snapshotSha256:hash.nullable(),status:z.enum(['completed','failed','held','unknown']),reason:z.string().regex(/^[a-z_-]{1,80}$/).nullable(),
  optimizerUpdates:z.union([z.literal(0),z.literal(1)]),inferenceCalls:count,
  trainObservations:z.array(z.strictObject({category:kind,expected:choice,observed:choice,matches:z.boolean()})).max(2),
  holdout:z.strictObject({count,beforeMatches:count,afterMatches:count,reloadVerified:z.boolean(),reused:z.literal(true),independentFinal:z.literal(false)}),
  split:z.strictObject({trainEntities:count,holdoutEntities:count,trainClaims:count,holdoutClaims:count,disjoint:z.literal(true),protectedEntitiesSha256:hash,protectedClaimsSha256:hash}),
  limits,peakRssMiB:z.number().finite().nonnegative().max(6144)});
const reportPayload=z.strictObject({contract:z.literal('education-report-v1'),createdAt:stamp,educatorKey:z.literal('plunode-official-ai'),apprenticeId:z.uuidv4(),
  selectionSourceSha256:hash,curriculumSha256:hash,curriculumVersion:z.literal('kg-structural-v2'),historySha256:hash,modelRevision:commit,
  cycles:z.array(reportCycle).min(1).max(32),totals:z.strictObject({realCycles:count,completedCycles:count,optimizerUpdates:count,inferenceCalls:count,modelAdoptions:z.literal(0)}),
  semanticReview:z.literal('pending-human'),generalizationEvidence:z.literal(false),holdoutAnswersIncluded:z.literal(false)});
const note=z.strictObject({ja:z.string().min(1).max(600),en:z.string().min(1).max(600),cycleIds:z.array(z.uuidv4()).min(1).max(32)});
const planPayload=z.strictObject({contract:z.literal('education-plan-v1'),planId:z.uuidv4(),createdAt:stamp,expiresAt:stamp,
  educatorKey:z.literal('plunode-official-ai'),officialAiIdentityId:z.uuidv4(),apprenticeId:z.uuidv4(),reportSha256:hash,selectionSourceSha256:hash,curriculumSha256:hash,
  basedOn:z.array(ref).min(1).max(32),method:z.enum(['interactive-codex','chatgpt-interactive','chatgpt-scheduled','local-evaluator']),
  facts:z.array(note).min(1).max(6),hypotheses:z.array(note).min(1).max(6),priorities:z.array(kind).min(1).max(6),difficulty:z.literal('single-edge'),
  nextEvaluation:z.array(z.enum(['protected-holdout','no-independent-final-claim','checkpoint-reload','semantic-review-pending'])).length(4),maxRealCycles:z.literal(1)});
const transport=z.strictObject({commentId:z.number().int().positive(),url:z.string().regex(/^https:\/\/github\.com\/isinxnisi\/graph-knowledge\/issues\/36#issuecomment-\d+$/),author:z.literal('isinxnisi')});
const scheduledEvidence=z.strictObject({version:z.literal('scheduled-channel-v1'),basis:z.enum(['operator-attested-run','registered-github-channel']),
  taskId:z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),runId:z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),scheduledFor:stamp,
  planSha256:hash,proposalSha256:hash,bodySha256:hash,registrationSha256:hash,
  registrationEvidenceUrl:z.string().regex(/^https:\/\/chatgpt\.com\/[A-Za-z0-9_/?=&.-]{8,300}$/),transport});
export const educationPolicySelection=z.strictObject({version:z.literal('teacher-policy-v1'),planSha256:hash.nullable(),reason:z.string().regex(/^[a-z_-]{1,80}$/),
  baselineTaskId:z.string().regex(/^generated-[a-f0-9]{20}$/),selectedTaskId:z.string().regex(/^generated-[a-f0-9]{20}$/),baselineKind:kind,selectedKind:kind,
  changed:z.boolean(),holdoutUnchanged:z.literal(true),splitDisjoint:z.literal(true),modelExecuted:z.literal(false)});
const selection=educationPolicySelection.extend({selectionId:z.uuidv4(),recordedAt:stamp,selectionSourceSha256:hash,trainTaskSha256:hash,protectedHoldoutSha256:hash});
export const educationMentorReview=z.strictObject({reviewId:hash,report:z.strictObject({sha256:hash,payload:reportPayload}),plan:z.strictObject({sha256:hash,payload:planPayload}),
  reportTransport:transport,decision:z.strictObject({decisionId:z.uuidv4(),recordedAt:stamp,planSha256:hash,reportSha256:hash,status:z.literal('accepted'),reason:z.literal('train-category-only'),transport,selectionSourceSha256:hash,executionEvidence:scheduledEvidence.optional()}),
  selection:selection.nullable()}).superRefine((v,ctx)=>{
    const r=v.report.payload,p=v.plan.payload,d=v.decision,s=v.selection;
    const fail=()=>ctx.addIssue({code:'custom',message:'Inconsistent education policy evidence'});
    if(p.reportSha256!==v.report.sha256||d.reportSha256!==v.report.sha256||d.planSha256!==v.plan.sha256||p.selectionSourceSha256!==r.selectionSourceSha256||d.selectionSourceSha256!==r.selectionSourceSha256||p.curriculumSha256!==r.curriculumSha256)fail();
    if(p.apprenticeId!==r.apprenticeId||p.basedOn.length!==r.cycles.length||p.basedOn.some((ref,i)=>ref.cycleId!==r.cycles[i].cycleId||ref.resultSha256!==r.cycles[i].resultSha256))fail();
    if(new Set(p.priorities).size!==p.priorities.length||new Set(p.nextEvaluation).size!==4)fail();
    const e=d.executionEvidence;
    if(p.method==='chatgpt-scheduled'){
      if(!e||e.planSha256!==v.plan.sha256||e.transport.commentId!==d.transport.commentId||e.transport.url!==d.transport.url||Date.parse(e.scheduledFor)>Date.parse(p.createdAt)+300000||Date.parse(p.createdAt)-Date.parse(e.scheduledFor)>7200000)fail();
    }else if(p.method!=='interactive-codex'||e)fail();
    if(Date.parse(p.expiresAt)<=Date.parse(p.createdAt)||Date.parse(p.expiresAt)-Date.parse(p.createdAt)>7*86400000||Date.parse(p.createdAt)<Date.parse(r.createdAt)||Date.parse(d.recordedAt)<Date.parse(p.createdAt))fail();
    if([...p.facts,...p.hypotheses].some(n=>n.cycleIds.some(id=>!p.basedOn.some(c=>c.cycleId===id))))fail();
    if(s&&(s.planSha256!==v.plan.sha256||s.selectionSourceSha256!==r.selectionSourceSha256||s.changed!==(s.baselineTaskId!==s.selectedTaskId)||s.selectedKind!==p.priorities[0]||Date.parse(s.recordedAt)<Date.parse(d.recordedAt)))fail();
    for(const t of [v.reportTransport,d.transport])if(!t.url.endsWith('#issuecomment-'+t.commentId))fail();
    if(r.totals.realCycles!==r.cycles.length||r.totals.completedCycles!==r.cycles.filter(c=>c.status==='completed').length||r.totals.optimizerUpdates!==r.cycles.reduce((n,c)=>n+c.optimizerUpdates,0)||r.totals.inferenceCalls!==r.cycles.reduce((n,c)=>n+c.inferenceCalls,0))fail();
  });
export const educationMentorship=z.strictObject({version:z.literal('education-policy-v1'),records:z.array(educationMentorReview).min(1).max(16),
  capabilities:z.strictObject({githubRead:z.literal('verified'),githubWrite:z.literal('verified'),interactiveAi:z.literal('verified'),
    chatgptScheduled:z.enum(['not-verified','read-write-verified','plan-verified']),dailySchedule:z.enum(['not-configured','not-inspected']),connectionEvidence:transport.optional()}),
  operation:z.strictObject({enabled:z.boolean(),workerObserved:z.boolean(),windowStart:z.string().regex(/^\d{2}:\d{2}$/),windowEnd:z.string().regex(/^\d{2}:\d{2}$/),dailyMax:z.number().int().min(1).max(4),
    timezone:z.literal('Asia/Tokyo'),provider:z.literal('cpu-independent'),scheduledChannel:z.enum(['registered','awaiting-first-plan-attestation']),
    lastTickAt:stamp.nullable(),lastTickStatus:z.string().max(80),lastTickReason:z.string().max(80).nullable()}).optional()});
export type EducationMentorship=z.infer<typeof educationMentorship>;
