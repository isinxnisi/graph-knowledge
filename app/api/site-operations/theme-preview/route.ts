import {themeOperator,operatorThemePreview,PRIVATE_THEME_HEADERS} from '../../../../lib/server/theme-operator-preview';
import {knowledgeThemeReadQuerySchema} from '../../../../lib/domain/knowledge-theme-reader';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{await themeOperator(request.headers);const q=new URL(request.url).searchParams,input=knowledgeThemeReadQuerySchema.parse({themeId:q.get('themeId'),language:q.get('language')??'ja',...(q.has('revision')?{revision:Number(q.get('revision'))}:{})});return Response.json(await operatorThemePreview(input.themeId,input.language??'ja',input.revision),{headers:PRIVATE_THEME_HEADERS});}
 catch(e){const status=e&&typeof e==='object'&&'status'in e?Number(e.status):400;return Response.json({error:'プレビューを閲覧できません。ログインと権限を確認してください。'},{status,headers:PRIVATE_THEME_HEADERS});}
}
