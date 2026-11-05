import {lstat,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {knowledgeDigest} from '../lib/server/knowledge-foundation';
import {knowledgeImportPackageSchema} from '../lib/domain/knowledge-import';
const configSchema=z.strictObject({origin:z.url(),tokenFile:z.string(),checkpointDirectory:z.string()});
async function privateFile(file:string,limit:number){
 const info=await lstat(file);
 if(!path.isAbsolute(file)||!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o600||info.size>limit)throw Error('private設定を確認してください（本人所有・絶対path・0600）。');
 return readFile(file,'utf8');
}
export async function runImportClient(args:string[]){
 const [configFile,action,input]=args;
 if(!configFile||!['send','status','cancel'].includes(action)||!input)throw Error('使い方: knowledge-import-client.ts private-client.json send package.json | status receipt-UUID | cancel receipt-UUID');
 const cfg=configSchema.parse(JSON.parse(await privateFile(configFile,16000))),origin=new URL(cfg.origin);
 if(origin.origin!==cfg.origin||origin.protocol!=='https:'||origin.username||origin.password)throw Error('配置先のHTTPS originを指定してください。');
 const dir=await lstat(cfg.checkpointDirectory);
 if(!path.isAbsolute(cfg.checkpointDirectory)||!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid?.()||(dir.mode&0o777)!==0o700)throw Error('checkpointは本人所有の0700ディレクトリに保存してください。');
 const token=(await privateFile(cfg.tokenFile,512)).trim();if(!/^[A-Za-z0-9_-]{43,128}$/.test(token))throw Error('送信資格の形式を確認してください。');
 let body:unknown,checkpoint:string|undefined;
 if(action==='send'){
  const info=await lstat(input);if(!info.isFile()||info.size>2000000)throw Error('2MB以内のpackageを指定してください。');
  body=JSON.parse(await readFile(input,'utf8'));const pkg=knowledgeImportPackageSchema.parse(body);
  checkpoint=path.join(cfg.checkpointDirectory,knowledgeDigest([pkg.namespace,pkg.packageId,pkg.revision])+'.json');
  try{const previous=JSON.parse(await privateFile(checkpoint,200000));if(previous.digest!==knowledgeDigest(body))throw Error('同じpackage版の内容が変わっています。以前の版を再送するか、版を上げてください。');}catch(e){if(!(e instanceof Error&&'code'in e&&e.code==='ENOENT'))throw e;}
 }else{z.uuidv4().parse(input);if(action==='cancel')body={reason:'送信元から未反映分を取消'};}
 const endpoint='/api/knowledge-import/packages'+(action==='send'?'':'/'+input+(action==='cancel'?'/cancel':''));
 // No redirect, credential in header only, bounded response; no implicit inference retry.
 const response=await fetch(cfg.origin+endpoint,{method:action==='status'?'GET':'POST',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});
 const reader=response.body?.getReader();if(!reader)throw Error('受付の応答がありません。同じpackage版を再送できます。');
 let size=0;const chunks:Uint8Array[]=[];for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2000000){await reader.cancel();throw Error('応答の上限を超えました。');}chunks.push(part.value);}
 const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(checkpoint&&response.ok){const temp=checkpoint+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify({digest:knowledgeDigest(body),receiptId:value.receiptId,response:value},null,2),{mode:0o600,flag:'wx'});await rename(temp,checkpoint);}
 return {httpStatus:response.status,...value};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runImportClient(process.argv.slice(2)).then(value=>console.log(JSON.stringify(value,null,2))).catch(()=>{console.error('送信できませんでした。設定・JSON・接続を確認し、同じpackage版を再送してください。資格値はログへ出力しません。');process.exitCode=1;});
}
