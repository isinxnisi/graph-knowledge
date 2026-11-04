import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';
import {z} from 'zod';
import {reviewConfigSchema} from '../lib/server/knowledge-review-queue';
import {reserveKnowledgeAI} from '../lib/server/knowledge-ai-budget';
import {callGeminiReview,geminiDuplicateReviewRequest,parseGeminiReview,GEMINI_REVIEW_POLICY} from '../lib/server/gemini-knowledge-review';
import {DUPLICATE_POLICY,duplicateReview} from '../lib/server/knowledge-duplicates';
import {knowledgeRecordContentSchema} from '../lib/domain/knowledge-foundation';
import {knowledgeReviewInputSchema} from '../lib/domain/knowledge-review';

// Synthetic comparison evaluation, charged atomically to the live shared free
// project ledger. Never publishes, enables billing or uses another quota key.
const file=process.env.KNOWLEDGE_REVIEW_CONFIG;
if(!file||!process.env.MEMBER_DATABASE_URL)throw Error('Explicit private review profile and member DB required');
const info=await lstat(file);if(!info.isFile()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o600)throw Error('Private profile ownership/mode differs');
const config=reviewConfigSchema.parse(JSON.parse(await readFile(file,'utf8'))),pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:1});
const corpus=await readFile('data/knowledge-duplicate-cases.json','utf8');
const cases=z.array(z.object({id:z.string().regex(/^[a-z0-9-]+$/),input:knowledgeReviewInputSchema,proposed:knowledgeRecordContentSchema,existing:knowledgeRecordContentSchema,expected:z.object({sameAs:z.string().nullable(),support:z.string()})})).max(24).parse(JSON.parse(corpus));
const output=path.resolve('.local/duplicate-evaluation/v1');await mkdir(output,{recursive:true,mode:0o700});
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const manifest={policy:DUPLICATE_POLICY,sourcePolicy:GEMINI_REVIEW_POLICY,model:config.model,corpusSha256:hash(corpus)};
const manifestFile=path.join(output,'manifest.json');
try{if(JSON.stringify(JSON.parse(await readFile(manifestFile,'utf8')))!==JSON.stringify(manifest))throw Error('Evaluation corpus/profile changed');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await writeFile(manifestFile,JSON.stringify(manifest),{mode:0o600,flag:'wx'});}
const key=(await readFile(config.apiKeyFile,'utf8')).trim();
try{
 const results=[];
 for(const test of cases){
  const request=geminiDuplicateReviewRequest(test.input,duplicateReview(test.proposed,[{id:'existing',revision:1,content:test.existing}])),wire=JSON.stringify(request),wireDigest=hash(wire);
  let target=path.join(output,test.id+'.json');const retryTarget=path.join(output,test.id+'.attempt-2.json');
  try{await lstat(retryTarget);target=retryTarget;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
   if(process.argv.includes('--retry-transient')||process.argv.includes('--retry-unknown')){
    const previous=JSON.parse(await readFile(target,'utf8'));
    if(process.argv.includes('--retry-transient')&&previous.response?.state==='http-error'&&previous.response.status===503||process.argv.includes('--retry-unknown')&&previous.response?.state==='delivery-unknown'){
     const old=(await pool.query('SELECT finished_at FROM member_knowledge.review_attempts WHERE id=$1',[previous.attemptId])).rows[0];
     if(!old||Date.now()-new Date(old.finished_at).getTime()<120000)throw Error('Wait at least two minutes before the one explicit transient retry');
     target=retryTarget;
    }
   }
  }
  let receipt:{wireDigest:string;response:unknown;attemptId:string}|undefined;
  try{receipt=JSON.parse(await readFile(target,'utf8'));if(receipt?.wireDigest!==wireDigest||!receipt?.response)throw Error('Prior delivery is uncertain; do not resend automatically');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(!receipt){
   let reservation:Awaited<ReturnType<typeof reserveKnowledgeAI>>;
   for(;;){const c=await pool.connect();
    try{await c.query('BEGIN');reservation=await reserveKnowledgeAI(c,config,{purpose:'evaluation',policy:DUPLICATE_POLICY,inputReserved:Buffer.byteLength(wire)+1024,outputReserved:2048});await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    const waitAt=reservation.state==='wait'?reservation.wait:undefined;
    if(!waitAt||waitAt.getTime()-Date.now()>61000)break;
    await new Promise(resolve=>setTimeout(resolve,Math.max(100,waitAt.getTime()-Date.now()+100)));
   }
   if(reservation.state!=='reserved'){console.log(JSON.stringify({state:reservation.state,completed:results.length,wait:reservation.state==='wait'?reservation.wait:undefined}));break;}
   const attemptId=reservation.id;await writeFile(target,JSON.stringify({attemptId,wireDigest,request,state:'sending'}),{mode:0o600,flag:'wx'});
   await pool.query("UPDATE member_knowledge.review_attempts SET state='sending' WHERE id=$1",[attemptId]);
   const result=await callGeminiReview({apiKey:key,model:config.model,request});
   const parsed=result.state==='received'?parseGeminiReview(result.raw):null,usage=parsed?.usage;
   await pool.query("UPDATE member_knowledge.review_attempts SET state=$2,finished_at=clock_timestamp(),request_charge=1,input_actual=$3,candidates_actual=$4,thoughts_actual=$5,cached_actual=$6,total_actual=$7,output_actual=$8 WHERE id=$1",[attemptId,result.state,usage?.promptTokenCount??null,usage?.candidatesTokenCount??null,usage?.thoughtsTokenCount??null,usage?.cachedContentTokenCount??null,usage?.totalTokenCount??null,usage?.candidatesTokenCount!=null&&usage?.thoughtsTokenCount!=null?usage.candidatesTokenCount+usage.thoughtsTokenCount:null]);
   await writeFile(target,JSON.stringify({attemptId,wireDigest,request,response:result,state:'finished'}),{mode:0o600});receipt={attemptId,wireDigest,response:result};
  }
  const response=receipt.response as Awaited<ReturnType<typeof callGeminiReview>>,parsed=response.state==='received'?parseGeminiReview(response.raw):null;
  const actual=parsed?.state==='reviewed'?parsed.review:null;
  const labelMatch=actual?.support===test.expected.support;
  const passed=parsed?.modelVersion===config.model&&actual?.duplicate?.sameAs===test.expected.sameAs&&(labelMatch||test.expected.support!=='supported'&&actual?.support!=='supported');
  results.push({id:test.id,passed,labelMatch,expected:test.expected,actual,attemptId:receipt.attemptId});
  await writeFile(path.join(output,'results.json'),JSON.stringify({manifest,completed:results.length,passed:results.filter(r=>r.passed).length,results},null,2),{mode:0o600});
  console.log(JSON.stringify({id:test.id,passed}));
 }
}finally{await pool.end();}
