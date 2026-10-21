// Only this isolated server is started. No inference, account credentials or scheduling.
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {homedir} from 'node:os';
import {legacyPort} from './legacy-port.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const dir=resolve(repo,'experiments/ai-lab/.runtime/observer');
await readFile(dir+'/.next/BUILD_ID','utf8');
const common=execFileSync('git',['rev-parse','--git-common-dir'],{cwd:repo,encoding:'utf8'}).trim();
const config=parseEnv(await readFile(resolve(dirname(common),'.env.public'),'utf8'));
const env={PATH:'/tmp/graph-knowledge-node/bin:/usr/bin:/bin',HOME:homedir(),NODE_ENV:'production',GRAPH_DATASET:'public-kg',NEO4J_READ_TIMEOUT_MS:'10000',NEXT_TELEMETRY_DISABLED:'1'};
for(const key of ['NEO4J_URI','NEO4J_USER','NEO4J_PASSWORD','NEO4J_DATABASE']){if(!config[key])throw Error('Missing existing public KG setting: '+key);env[key]=config[key];}
const compatibility=legacyPort();
await new Promise((resolve,reject)=>{compatibility.once('error',reject);compatibility.listen(3286,'127.0.0.1',resolve);});
const child=spawn(process.execPath,[dir+'/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3268'],{cwd:dir,env,stdio:'inherit'});
function closeCompatibility(){compatibility.close();compatibility.closeAllConnections();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{closeCompatibility();child.kill(signal);});
child.on('error',()=>{closeCompatibility();process.exitCode=1;});
child.on('exit',code=>{closeCompatibility();process.exitCode=code??1;});
