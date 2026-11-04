import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';
import {z} from 'zod';
import {reviewConfigSchema,createReviewQueue} from '../lib/server/knowledge-review-queue';
import {reserveKnowledgeAI} from '../lib/server/knowledge-ai-budget';
import {translationGenerationRequest} from '../lib/server/knowledge-translation-generation';
import {callGeminiReview,parseGeminiJson} from '../lib/server/gemini-knowledge-review';
import {TRANSLATION_GENERATION_POLICY} from '../lib/domain/knowledge-translation-generation';
const file=process.env.KNOWLEDGE_REVIEW_CONFIG;
if(!file||!process.env.MEMBER_DATABASE_URL)throw Error('Explicit existing free project required');
const cfg=reviewConfigSchema.parse(JSON.parse(await readFile(file,'utf8'))),pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:1});
const dir=path.resolve('.local/translation-generation-evaluation');await mkdir(dir,{recursive:true,mode:0o700});
const cases=z.array(z.object({id:z.string().regex(/^[a-z-]+$/),text:z.string(),language:z.enum(['ja','en']),sourceLanguage:z.string(),check:z.string()})).max(6).parse(JSON.parse(await readFile('data/knowledge-translation-generation-cases.json','utf8')));
try{const key=(await readFile(cfg.apiKeyFile,'utf8')).trim();
 for(const item of cases){const dest=path.join(dir,item.id+'.json');try{await readFile(dest);continue;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const wire=translationGenerationRequest(item.text,item.language,item.sourceLanguage),c=await pool.connect();let attempt:string;
  try{await c.query('BEGIN');const r=await reserveKnowledgeAI(c,cfg,{purpose:'translation-evaluation',policy:TRANSLATION_GENERATION_POLICY,inputReserved:Buffer.byteLength(JSON.stringify(wire))+1024,outputReserved:4096});await c.query('COMMIT');if(r.state!=='reserved'){console.log(JSON.stringify({state:r.state,reason:r.state==='wait'?r.reason:null}));break;}attempt=r.id;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  await writeFile(dest,JSON.stringify({id:item.id,attempt,state:'sending'}),{mode:0o600,flag:'wx'});
  const result=await callGeminiReview({apiKey:key,model:cfg.model,request:wire}),parsed=result.state==='received'?parseGeminiJson(result.raw):null,u=parsed?.usage;
  await pool.query('UPDATE member_knowledge.review_attempts SET state=$2,finished_at=clock_timestamp(),input_actual=$3,candidates_actual=$4,thoughts_actual=$5,cached_actual=$6,total_actual=$7,output_actual=$8 WHERE id=$1',[attempt,result.state,u?.promptTokenCount??null,u?.candidatesTokenCount??null,u?.thoughtsTokenCount??null,u?.cachedContentTokenCount??null,u?.totalTokenCount??null,u?.candidatesTokenCount!=null&&u?.thoughtsTokenCount!=null?u.candidatesTokenCount+u.thoughtsTokenCount:null]);
  await writeFile(dest,JSON.stringify({item,attempt,model:cfg.model,result,parsed},null,2),{mode:0o600});console.log(JSON.stringify({id:item.id,state:parsed?.state??result.state}));
  if(result.state==='http-error'||result.state==='delivery-unknown')break;
  if(item!==cases.at(-1))await new Promise(r=>setTimeout(r,Math.ceil(60000/cfg.rpm)+200));
 }
 const usage=await createReviewQueue(pool).usage(cfg);await writeFile(path.join(dir,'usage.json'),JSON.stringify(usage),{mode:0o600});
}finally{await pool.end();}
