// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fixtureV4Schema} from '../lib/domain/fixture';
import {labCounts} from '../lib/domain/ai-lab';
import {parseLabArtifact,sealLabArtifact,activateLabArtifact,type LabKgReader} from '../lib/server/ai-lab-artifact';
import AiLabMentorship from '../components/AiLabMentorship';
const current=parseLabArtifact(await readFile('docs/verification/ai-education-policy-20261028/public-artifact.json'));
const previous=parseLabArtifact(await readFile('docs/verification/ai-lab-autonomous-20261027/public-artifact.json'));
const fixture=fixtureV4Schema.parse(JSON.parse(gunzipSync(await readFile('experiments/ai-lab/data/curriculum-public.json.gz')).toString()));
const kg:LabKgReader=async url=>{
 if(url==='/api/dataset')return {dataset:'public-kg',revision:'policy-validation'};
 const id=url.split('/').at(-1);
 if(url.startsWith('/api/entities/')){const e=fixture.entities.find(e=>e.id===id)!;return {entity:{id:e.id,kind:e.kind,name:e.name,description:e.description,aliases:e.aliases,event:e.event??null}};}
 const c=fixture.claims.find(c=>c.id===id)!;
 return {claim:{id:c.id,subjectId:c.subjectId,objectId:c.objectId,predicate:c.predicate,polarity:c.polarity,period:c.period,contribution:c.contribution,createdAt:c.createdAt,updatedAt:c.updatedAt,sourceCount:1,organizationParticipation:null,eventParticipation:null,citations:fixture.citations.filter(x=>x.claimId===id).map(x=>({id:x.id,locator:x.locator,note:x.note,accessedAt:x.accessedAt,stance:x.stance,roleEvidence:x.roleEvidence??null,positionEvidence:null,eventParticipationEvidence:null,source:fixture.sources.find(s=>s.id===x.sourceId)}))}};
};
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('公式AI教育方針の往復',()=>{
 it('v1/v3の全履歴・推論・学習回数を保全し、選択だけの検証を区別する',()=>{
  expect(current.payload.runs).toEqual(previous.payload.runs);expect(current.payload.education).toEqual(previous.payload.education);
  expect(labCounts(current.payload)).toEqual({inference:6,training:1,baseline:5,held:4});
  const r=current.payload.mentorship!.records[0];expect(r.selection?.baselineKind).toBe('polarity');expect(r.selection?.selectedKind).toBe('evidence');
  expect(r.selection?.holdoutUnchanged).toBe(true);expect(r.selection?.modelExecuted).toBe(false);expect(r.plan.payload.method).toBe('interactive-codex');
  expect(JSON.stringify(r.report)).not.toMatch(/generated-|claimId|optimizer\.pt|\/home\/|requestWire|password|token|holdoutTaskIds/);
 });
 it('hash・Identity・対象cycle・holdout集計・危険fieldの改ざんを拒否する',()=>{
  for(const change of [
   (p:typeof current.payload)=>{p.mentorship!.records[0].report.sha256='a'.repeat(64);},
   (p:typeof current.payload)=>{p.mentorship!.records[0].plan.payload.officialAiIdentityId='501350be-a89f-4bde-9a06-d94631b47be6';},
   (p:typeof current.payload)=>{p.mentorship!.records[0].plan.payload.basedOn=[];},
   (p:typeof current.payload)=>{p.mentorship!.records[0].selection!.holdoutUnchanged=false as true;},
   (p:typeof current.payload)=>{p.mentorship!.records[0].report.payload.cycles[1].holdout.afterMatches=9;},
   (p:typeof current.payload)=>{Object.assign(p.mentorship!.records[0].plan.payload,{command:'arbitrary'});},
  ]){const p=structuredClone(current.payload);change(p);expect(()=>sealLabArtifact(p)).toThrow();}
 });
 it('保持済み版へのrollbackを除き教師記録の削除・変更を拒否する',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'teacher-artifact-'));
  try{
   await activateLabArtifact(dir,previous,null,kg);await activateLabArtifact(dir,current,previous.sha256,kg);
   const dropped=structuredClone(previous.payload);dropped.version='new-version-without-teacher';
   await expect(activateLabArtifact(dir,sealLabArtifact(dropped),current.sha256,kg)).rejects.toThrow();
   await activateLabArtifact(dir,previous,current.sha256,kg);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 for(const en of [false,true])it(`${en?'English':'日本語'}で実AI評価・ルール採用・未実施・未接続を区別する`,()=>{
  render(<AiLabMentorship mentorship={current.payload.mentorship!} cycles={current.payload.education!.cycles} en={en}/>);
  expect(screen.getByText(en?'AI evaluation · interactive Codex':'AIによる評価・対話内Codex')).toBeTruthy();
  expect(screen.getByTestId('mentor-selection').textContent).toMatch(en?/Evidence/:/根拠不足/);
  expect(screen.getByText(en?/not executed by a ChatGPT scheduled task/:/ChatGPT定期タスクによる評価ではありません/)).toBeTruthy();
  expect(screen.getByText(en?/no daily evaluation schedule is registered/:/日次評価は未登録/)).toBeTruthy();
  expect(screen.getByRole('link',{name:en?'Plunode official AI · education review':'Plunode公式AI・教育評価'}).getAttribute('href')).toBe(en?'/en/people/plunode-official-ai':'/people/plunode-official-ai');
 });
});
