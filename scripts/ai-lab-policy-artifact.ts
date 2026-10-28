import {writeFile} from 'node:fs/promises';
import {readActiveLabArtifact,readLabFile,parseLabArtifact,verifyLabPublicReferences,publicLabKgReader,activateLabArtifact} from '../lib/server/ai-lab-artifact';
import {withEducationPolicies} from '../lib/server/ai-lab-policy-artifact';
const [command,home,destination,origin,baseFile,...extra]=process.argv.slice(2);
if(extra.length||!home||!destination||!origin||!['stage','activate'].includes(command)||command==='stage'&&!baseFile||command==='activate'&&baseFile)throw Error('stage HOME OUTPUT ORIGIN BASE_JSON | activate HOME DIRECTORY ORIGIN');
const current=command==='activate'?await readActiveLabArtifact(destination):null;
const base=command==='stage'?parseLabArtifact(await readLabFile(baseFile)):current;
if(!base)throw Error('Existing accepted public artifact required');
const artifact=withEducationPolicies(base,home),get=publicLabKgReader(origin);
if(command==='stage'){
  const validatedKgRevision=await verifyLabPublicReferences(artifact,get);
  await writeFile(destination,JSON.stringify(artifact)+'\n',{flag:'wx',mode:0o640});
  console.log(JSON.stringify({sha256:artifact.sha256,validatedKgRevision,teacherRecords:artifact.payload.mentorship?.records.length}));
}else console.log(JSON.stringify(await activateLabArtifact(destination,artifact,current!.sha256,get)));
