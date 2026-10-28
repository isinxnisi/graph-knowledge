// Operator-side only. This module is never imported by Web readers.
import {spawnSync} from 'node:child_process';
import {educationMentorship} from '../domain/ai-education-policy';
import {canonicalLabJson,type LabArtifact} from '../domain/ai-lab';
import {sealLabArtifact} from './ai-lab-artifact';

export function withEducationPolicies(base:LabArtifact,home:string):LabArtifact{
  const result=spawnSync('python3',['experiments/ai-lab/project_mentorship.py',home],{encoding:'utf8',maxBuffer:256_000,timeout:30_000});
  if(result.status!==0)throw Error('Teacher exchange evidence verification failed');
  const raw=JSON.parse(result.stdout);
  if(Array.isArray(raw.records)&&raw.records.length===0)return base;
  const incoming=educationMentorship.parse(raw),records=[...(base.payload.mentorship?.records??[])];
  for(const record of incoming.records){
    const previous=records.find(r=>r.reviewId===record.reviewId);
    if(previous&&canonicalLabJson(previous)!==canonicalLabJson(record))throw Error('Immutable teacher record changed');
    if(!previous)records.push(record);
  }
  const recordedAt=[base.payload.recordedAt,...records.map(r=>r.selection?.recordedAt??r.decision.recordedAt)].sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
  return sealLabArtifact({...base.payload,schemaVersion:4,version:'education-policy-v1-'+records.at(-1)!.plan.sha256.slice(0,8),recordedAt,mentorship:{...incoming,records}});
}
