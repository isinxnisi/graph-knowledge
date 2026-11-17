import {themeProductsResponse} from '../../../../lib/server/theme-product-response';
import {themeOperator,operatorThemePreview,PRIVATE_THEME_HEADERS} from '../../../../lib/server/theme-operator-preview';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{await themeOperator(request.headers);const response=await themeProductsResponse(request,{resolve:(id,revision)=>operatorThemePreview(id,'ja',revision)});for(const [key,value] of Object.entries(PRIVATE_THEME_HEADERS))response.headers.set(key,value);return response;}
 catch{return Response.json({error:'閲覧できません'},{status:404,headers:PRIVATE_THEME_HEADERS});}
}
