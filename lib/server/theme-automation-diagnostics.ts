import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {KnowledgeError} from './knowledge-foundation';

export const themeAutomationEnabled=()=>process.env.THEME_AUTOMATION_ENABLED==='1';
export const themeEnvironment=(origin:string)=>origin==='https://plunode.net'?'production':'beta';
const uuid=z.uuidv4();
const ingressContext=new AsyncLocalStorage<string>();
export const withThemeIngress=<T>(id:string,work:()=>Promise<T>)=>ingressContext.run(id,work);
let build: string | undefined;
export function themeAutomationBuild(){
  if(build)return build;
  for(const path of ['.next-public/BUILD_ID','.next/BUILD_ID']){
    try{
      const value=readFileSync(path,'utf8').trim();
      if(/^[a-zA-Z0-9_-]{8,100}$/.test(value))return build=value;
    }catch{}
  }
  return 'development';
}

type Event={
  stage:string;code:string;caseId?:string;requestId?:string;executionId?:string;attemptId?:string;ingressId?:string;
};

export async function themeDiagnostic(db:Pool|PoolClient,origin:string,event:Event){
  await db.query(`INSERT INTO theme_production.diagnostics
    (ingress_id,case_id,request_id,execution_id,attempt_id,environment,build,stage,code)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[
    event.ingressId??ingressContext.getStore(),event.caseId,event.requestId,event.executionId,event.attemptId,
    themeEnvironment(origin),themeAutomationBuild(),event.stage,event.code,
  ]);
}

const betaProtocolMethods=new Map([
  ['initialize','INITIALIZE'],['notifications/initialized','INITIALIZED'],['tools/list','TOOLS_LIST'],['ping','PING'],
]);
const betaReadOperations=new Set(['get_theme_authoring_guide','get_theme_production','read_theme_quality_guide','read_theme_work_guide','read_theme']);
const operations=new Set([
  'upload_editorial_image','generate_theme_image','capture_theme_review_preview','read_theme_review_evidence',
  'claim_theme_production','update_theme_production','prepare_theme_production_submission','dispatch_theme_production_submission',
  'report_theme_external_blocker','read_theme_automation',
]);
export function themeMcpDiagnostics(pool:Pool,origin:string){
  const ingressId=randomUUID();
  let tracked=false;
  const beta=origin==='https://graph-beta.isinxnisi.com';
  async function record(event:Event){
    if(!themeAutomationEnabled())return;
    try{await themeDiagnostic(pool,origin,{...event,ingressId});}
    catch{console.error('Theme MCP diagnostic storage unavailable',{ingressId,stage:event.stage});}
  }
  return {
    ingressId,
    async received(){await record({stage:'mcp-ingress',code:'RECEIVED'});},
    async command(command:{action:string;requestId?:unknown;caseId?:unknown;executionId?:unknown},value:unknown){
      if(!tracked)return;
      const parsed=z.object({ok:z.boolean().optional(),code:z.string().optional(),publicationError:z.object({code:z.string()}).optional()}).safeParse(value);
      const errorCode=parsed.success?parsed.data.publicationError?.code??(parsed.data.ok===false?parsed.data.code:undefined):undefined;
      const id=(v:unknown)=>uuid.safeParse(v).data;
      await record({stage:'mcp-result',code:errorCode&&/^[A-Z][A-Z0-9_]{0,79}$/.test(errorCode)?errorCode:'RETURNED',
        requestId:id(command.requestId),caseId:id(command.caseId),executionId:id(command.executionId)});
    },
    async authenticated(body:unknown){
      for(const member of Array.isArray(body)?body:[body]){
        if(beta&&member&&typeof member==='object'&&'method' in member&&typeof member.method==='string'){
          const method=betaProtocolMethods.get(member.method);
          if(method){tracked=true;await record({stage:'mcp-protocol',code:method});continue;}
        }
        const parsed=z.object({method:z.literal('tools/call'),params:z.object({
          name:z.string(),arguments:z.object({requestId:uuid.optional(),caseId:uuid.optional(),executionId:uuid.optional()}).optional(),
        })}).safeParse(member);
        if(!parsed.success)continue;
        const name=parsed.data.params.name;
        if(!operations.has(name)&&!(beta&&betaReadOperations.has(name)))continue;
        tracked=true;
        const ids=parsed.data.params.arguments;
        await record({stage:'mcp-authenticated',code:parsed.data.params.name,requestId:ids?.requestId,caseId:ids?.caseId,executionId:ids?.executionId});
      }
    },
    async finished(status:number){
      if(status>=400||tracked)await record({stage:'mcp-http',code:'HTTP_'+status});
    },
  };
}
export function diagnosticError(error:unknown,fallback:string){
  const code=error instanceof KnowledgeError?error.code:fallback;
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(code)?code:fallback;
}
