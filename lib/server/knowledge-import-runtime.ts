import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';
import {importConfigurationSchema,type ImportConfiguration} from '../domain/knowledge-import';
import {KnowledgeError} from './knowledge-foundation';
import {createKnowledgeImports} from './knowledge-import';
import {createKnowledgeImportHttp} from './knowledge-import-http';
import {memberConfig} from './member/config';
import {knowledgeReadConfiguration} from './knowledge-read-runtime';
export async function loadImportConfiguration():Promise<ImportConfiguration>{
 const file=process.env.KNOWLEDGE_IMPORT_CONFIG;
 if(process.env.KNOWLEDGE_IMPORT_ENABLED!=='1'||!file||!path.isAbsolute(file))throw new KnowledgeError('受付がありません',404,'NOT_FOUND');
 const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o600||info.size>128000)throw new KnowledgeError('取込の配置設定を確認してください',503,'IMPORT_UNAVAILABLE');
 try{return importConfigurationSchema.parse(JSON.parse(await readFile(file,'utf8')));}catch{throw new KnowledgeError('取込の配置設定を確認してください',503,'IMPORT_UNAVAILABLE');}
}
let api:ReturnType<typeof createKnowledgeImportHttp>|undefined,service:ReturnType<typeof createKnowledgeImports>|undefined;
export function knowledgeImportHttp(){
 const member=memberConfig();
 api??=createKnowledgeImportHttp(member?.origin??'',loadImportConfiguration,async()=>{
  if(!member)throw new KnowledgeError('受付がありません',404,'NOT_FOUND');
  if(service)return service;
  await loadImportConfiguration();
  const pool=new Pool({connectionString:member.databaseUrl,max:4}),knowledge=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:3});
  service=createKnowledgeImports(pool,knowledge,async id=>(await loadImportConfiguration()).principals.find(p=>p.id===id)??null);return service;
 });return api;
}
