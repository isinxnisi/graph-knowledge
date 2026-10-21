import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
const repo=new URL('../../',import.meta.url),dir=homedir()+'/.local/share/plunode-community-connected';
await readFile(dir+'/.next/BUILD_ID','utf8');
const config=parseEnv(await readFile(new URL('.env.public',repo),'utf8'));
const env={PATH:'/tmp/graph-knowledge-node/bin:/usr/bin:/bin',HOME:homedir(),NODE_ENV:'production',GRAPH_DATASET:'public-kg',NEO4J_READ_TIMEOUT_MS:'10000'};
for(const key of ['NEO4J_URI','NEO4J_USER','NEO4J_PASSWORD','NEO4J_DATABASE']){if(!config[key])throw Error('Missing local public KG setting: '+key);env[key]=config[key];}
const child=spawn(process.execPath,[dir+'/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3275'],{cwd:dir,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>{process.exitCode=code??1;});
