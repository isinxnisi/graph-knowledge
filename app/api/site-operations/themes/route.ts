import {themeOperator,operatorThemeList,PRIVATE_THEME_HEADERS} from '../../../../lib/server/theme-operator-preview';
import {operatorThemesSchema} from '../../../../lib/domain/theme-operations';
export const dynamic='force-dynamic';
function compactCaseBrief(value:unknown){
 if(typeof value!=='string')return undefined;
 const oneLine=value.trim().replace(/\s+/gu,' ');
 return oneLine.length>160?oneLine.slice(0,159)+'…':oneLine||undefined;
}
export async function GET(request:Request){
 try{
  if(process.env.SITE_OPERATIONS_ENABLED!=='1')return Response.json({error:'閲覧できません。'},{status:404,headers:PRIVATE_THEME_HEADERS});
  const owner=await themeOperator(request.headers);
  if(request.headers.has('x-member-user')&&request.headers.get('x-member-user')!==owner)return Response.json({error:'閲覧できません。'},{status:401,headers:PRIVATE_THEME_HEADERS});
  const rows=await operatorThemeList(owner);
  const result=operatorThemesSchema.parse({items:rows.map(r=>({id:r.id,title:r.title,currentRevision:r.current_revision,publishedRevision:r.published_revision,
   state:r.state,
   caseId:r.work?.id??null,
   caseBrief:r.state==='production'||r.state==='review'?compactCaseBrief(r.work?.progress.brief):undefined,
   unfinished:r.work?.status==='abandoned'?[]:r.work?.progress.unfinished??[],blockers:r.work?.status==='abandoned'?[]:r.work?.progress.blockers??[],
  }))});
  return Response.json(result,{headers:PRIVATE_THEME_HEADERS});
 }catch(error){const status=error&&typeof error==='object'&&'status' in error?Number(error.status):503;return Response.json({error:'テーマ制作一覧を取得できません。'},{status,headers:PRIVATE_THEME_HEADERS});}
}
