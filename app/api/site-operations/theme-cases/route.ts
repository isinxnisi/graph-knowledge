import {abandonThemeProductionSchema,getThemeProductionSchema,listThemeProductionsSchema,themeProductionCaseSchema,themeProductionListSchema,themeProductionResponseSchema} from '../../../../lib/domain/theme-production';
import {operatorThemeCaseDetailsSchema} from '../../../../lib/domain/theme-operations';
import {MemberError,assertMemberOrigin,memberInput} from '../../../../lib/server/member/http';
import {dispatchThemeRegistration} from '../../../../lib/server/member/knowledge-theme-registration';
import {memberRuntime} from '../../../../lib/server/member/runtime';
import {PRIVATE_THEME_HEADERS,themeOperator} from '../../../../lib/server/theme-operator-preview';

export const dynamic='force-dynamic';

function json(value:unknown,status=200){return Response.json(value,{status,headers:PRIVATE_THEME_HEADERS});}

async function handle(request:Request,run:(owner:string)=>Promise<unknown>){
 try{
  if(process.env.SITE_OPERATIONS_ENABLED!=='1')throw new MemberError(404,'NOT_FOUND');
  const owner=await themeOperator(request.headers);
  if(request.headers.has('x-member-user')&&request.headers.get('x-member-user')!==owner)throw new MemberError(401,'MEMBER_CHANGED');
  return json(await run(owner));
 }catch(error){
  const status=error&&typeof error==='object'&&'status' in error?Number(error.status):503;
  const code=error&&typeof error==='object'&&'code' in error?String(error.code):'REQUEST_FAILED';
  return json({error:{code}},status);
 }
}

export function GET(request:Request){
 return handle(request,async owner=>{
  const query=new URL(request.url).searchParams;
  const caseId=query.get('caseId');
  if(caseId!==null){
   const input=getThemeProductionSchema.safeParse({
    caseId,submissionCursor:Number(query.get('submissionCursor')??0),includeSettledSubmissions:true,
    operationCursor:Number(query.get('operationCursor')??0),
   });
   if(!input.success)throw new MemberError(400,'INVALID_ARGUMENT');
   const result=themeProductionResponseSchema.parse(await dispatchThemeRegistration(owner,{action:'get-theme-production',...input.data}));
   const current=themeProductionCaseSchema.parse(result.case);
   const {id,version,workflow,phase,status,updatedAt,lease,abandonReason,progress,pendingSubmissionCount,
    submissions,nextSubmissionCursor,operationHistory,lastWholeThemeAssessment}=current;
   const safeProgress={brief:progress.brief,scope:progress.scope,unfinished:progress.unfinished,blockers:progress.blockers};
   const base={id,version,progress:safeProgress,submissions,nextSubmissionCursor,operationHistory};
   if(query.get('includeCaseContext')!=='1')return base;
   const assessment=lastWholeThemeAssessment?{
    result:lastWholeThemeAssessment.result,current:lastWholeThemeAssessment.current,
    evaluatedAt:lastWholeThemeAssessment.evaluatedAt,summary:lastWholeThemeAssessment.summary,
   }:null;
   return operatorThemeCaseDetailsSchema.parse({
    ...base,workflow,phase,status,updatedAt,lease,abandonReason,pendingSubmissionCount,
    publicationPending:current.publication?.pending===true,
    publicationConflict:!!current.evaluationTarget?.publicationConflict,assessment,
   });
  }
  const input=listThemeProductionsSchema.safeParse({themeId:query.get('themeId'),cursor:Number(query.get('cursor')??0)});
  if(!input.success)throw new MemberError(400,'INVALID_ARGUMENT');
  return themeProductionListSchema.parse(await dispatchThemeRegistration(owner,{action:'list-theme-productions',...input.data}));
 });
}

export function POST(request:Request){
 return handle(request,async owner=>{
  assertMemberOrigin(request,memberRuntime().config.origin);
  if(!request.headers.has('x-member-user'))throw new MemberError(400,'INVALID_ARGUMENT');
  const input=await memberInput(request,abandonThemeProductionSchema,12_000);
  const result=themeProductionResponseSchema.parse(await dispatchThemeRegistration(owner,{action:'abandon-theme-production',...input}));
  return {outcome:result.outcome};
 });
}
