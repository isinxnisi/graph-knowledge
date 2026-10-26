import {describe,it,expect} from 'vitest';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fixtureV4Schema} from '../lib/domain/fixture';
import {labCounts,canonicalLabJson} from '../lib/domain/ai-lab';
import {parseLabArtifact,sealLabArtifact,verifyLabPublicReferences,activateLabArtifact,type LabKgReader} from '../lib/server/ai-lab-artifact';

const artifact=parseLabArtifact(await readFile('docs/verification/ai-lab-autonomous-20261027/public-artifact.json'));
const previous=parseLabArtifact(await readFile('docs/verification/ai-lab-education-20261026/public-artifact.json'));
const fixture=fixtureV4Schema.parse(JSON.parse(gunzipSync(await readFile('experiments/ai-lab/data/curriculum-public.json.gz')).toString()));
const kg:LabKgReader=async url=>{
  if(url==='/api/dataset')return {dataset:'public-kg',revision:'test-pinned-public'};
  const id=url.split('/').at(-1);
  if(url.startsWith('/api/entities/')){const e=fixture.entities.find(e=>e.id===id)!;return {entity:{id:e.id,kind:e.kind,name:e.name,description:e.description,aliases:e.aliases,event:e.event??null}};}
  const claim=fixture.claims.find(c=>c.id===id)!;
  const publicClaim={id:claim.id,subjectId:claim.subjectId,objectId:claim.objectId,predicate:claim.predicate,polarity:claim.polarity,period:claim.period,contribution:claim.contribution,createdAt:claim.createdAt,updatedAt:claim.updatedAt};
  return {claim:{...publicClaim,sourceCount:1,organizationParticipation:null,eventParticipation:null,citations:fixture.citations.filter(c=>c.claimId===id).map(c=>({id:c.id,locator:c.locator,note:c.note,accessedAt:c.accessedAt,stance:c.stance,roleEvidence:c.roleEvidence??null,positionEvidence:null,eventParticipationEvidence:null,source:fixture.sources.find(s=>s.id===c.sourceId)}))}};
};
describe('自動教育の観察記録',()=>{
  it('旧10記録を維持し、合成テストを関係推論・教育回数へ混入させない',()=>{
    expect(artifact.payload.runs.slice(0,10)).toEqual(previous.payload.runs);
    expect(labCounts(artifact.payload)).toEqual({inference:6,training:1,baseline:5,held:4});
    const cycles=artifact.payload.education!.cycles;
    expect(cycles.map(c=>c.status)).toEqual(['completed','failed','completed']);
    expect(cycles[0].kind).toBe('synthetic-infrastructure');expect(cycles[0].inferenceCalls).toBe(0);
    expect(cycles[2].comparison?.before.at(-1)?.choice).toBe('STOP');expect(cycles[2].comparison?.after[0].choice).toBe('C0');
    expect(cycles.every(c=>c.semanticReview==='pending-human'&&!c.generalizationEvidence&&!c.training.adopted)).toBe(true);
    expect(canonicalLabJson(artifact)).not.toMatch(/requestWire|rawResponse|\/home\/|apiKey|optimizer\.pt|acceptable|expectedAccuracy/);
  });
  it('Entity/Claim/componentの混入、更新の捏造、回数・再読込の矛盾を拒否する',()=>{
    for(const change of [
      (p:typeof artifact.payload)=>{p.education!.cycles[2].tasks[1].componentSha256=p.education!.cycles[2].tasks[0].componentSha256;},
      (p:typeof artifact.payload)=>{p.education!.cycles[2].training.afterSha256=p.education!.cycles[2].training.beforeSha256;},
      (p:typeof artifact.payload)=>{p.education!.cycles[2].inferenceCalls=3;},
      (p:typeof artifact.payload)=>{p.education!.cycles[2].training.checkpointSaved=false;},
      (p:typeof artifact.payload)=>{p.education!.cycles[0].inferenceCalls=1;},
      (p:typeof artifact.payload)=>{p.education!.cycles[2].tasks[0].evaluationBasis='pending-human';},
    ]){const p=structuredClone(artifact.payload);change(p);expect(()=>sealLabArtifact(p)).toThrow();}
  });
  it('現行公開KGの根拠を検査し、非公開化やsupport消失を拒否する',async()=>{
    expect(await verifyLabPublicReferences(artifact,kg)).toBe('test-pinned-public');
    const target=artifact.payload.education!.cycles[2].tasks[0].paths[0].steps[0].claimId;
    await expect(verifyLabPublicReferences(artifact,async url=>{const v=await kg(url);return url.endsWith(target)?{claim:{...(v as {claim:object}).claim,citations:[]}}:v;})).rejects.toThrow();
  });
  it('公開済みサイクルの追記契約と保持済み版へのロールバックを検証する',async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),'education-public-'));
    try{
      await activateLabArtifact(dir,previous,null,kg);await activateLabArtifact(dir,artifact,previous.sha256,kg);
      const changed=structuredClone(artifact.payload);changed.education!.cycles[0].sourceSha256='a'.repeat(64);
      await expect(activateLabArtifact(dir,sealLabArtifact(changed),artifact.sha256,kg)).rejects.toThrow();
      await activateLabArtifact(dir,previous,artifact.sha256,kg);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
});
