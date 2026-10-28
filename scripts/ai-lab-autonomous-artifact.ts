import {withEducationPolicies} from '../lib/server/ai-lab-policy-artifact';
import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {readActiveLabArtifact,parseLabArtifact,readLabFile,sealLabArtifact,verifyLabPublicReferences,publicLabKgReader,activateLabArtifact} from '../lib/server/ai-lab-artifact';
import {canonicalLabJson,educationCycleSchema} from '../lib/domain/ai-lab';

const args=process.argv.slice(2);
const command=args.shift();
if(!['stage','activate'].includes(command??''))throw Error('stage HOME OUTPUT KG_ORIGIN BASE_JSON ID... | activate HOME DIRECTORY ID...');
const home=args.shift()!,destination=args.shift()!;
let origin='http://127.0.0.1:3200';
const current=command==='activate'?await readActiveLabArtifact(destination):null;
if(command==='stage')origin=args.shift()!;
const base=command==='stage'?parseLabArtifact(await readLabFile(args.shift()!)):current??parseLabArtifact(await readLabFile('data/ai-lab/initial.json'));
if(!home||!destination||!args.length)throw Error('Missing explicit projection inputs');
const additions=[];
for(const id of args){
  const result=spawnSync('python3',['experiments/ai-lab/project_education.py',home,id],{encoding:'utf8',maxBuffer:256_000,timeout:30_000});
  if(result.status!==0)throw Error('Private education evidence verification failed');
  const cycle=educationCycleSchema.parse(JSON.parse(result.stdout));
  const previous=[...(base.payload.education?.cycles??[]),...additions].find(c=>c.cycleId===cycle.cycleId);
  if(previous&&canonicalLabJson(previous)!==canonicalLabJson(cycle))throw Error('Immutable cycle changed');
  if(!previous)additions.push(cycle);
}
const cycles=[...(base.payload.education?.cycles??[]),...additions];
const latest=[...base.payload.runs,...cycles,...(base.payload.mentorship?.records.map(r=>({finishedAt:r.selection?.recordedAt??r.decision.recordedAt}))??[])].sort((a,b)=>Date.parse(b.finishedAt)-Date.parse(a.finishedAt))[0].finishedAt;
const artifact=withEducationPolicies(sealLabArtifact({...base.payload,schemaVersion:base.payload.mentorship?4:3,version:'autonomous-v1-'+cycles.at(-1)!.cycleId.slice(0,8),recordedAt:latest,education:{version:'autonomous-v1',cycles}}),home);
const reader=publicLabKgReader(origin);
if(command==='stage'){
  const validatedKgRevision=await verifyLabPublicReferences(artifact,reader);
  await writeFile(destination,JSON.stringify(artifact)+'\n',{flag:'wx',mode:0o640});
  console.log(JSON.stringify({sha256:artifact.sha256,validatedKgRevision,cycles:cycles.length}));
}else console.log(JSON.stringify(await activateLabArtifact(destination,artifact,current?.sha256??null,reader)));
