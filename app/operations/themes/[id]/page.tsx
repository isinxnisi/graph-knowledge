import {decodePublicEntityId} from '../../../../lib/domain/public-routes';
import {knowledgeThemeReadQuerySchema} from '../../../../lib/domain/knowledge-theme-reader';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {themeOperator,operatorThemePreview} from '../../../../lib/server/theme-operator-preview';
import {ExplorationPage} from '../../../../lib/server/exploration-page';
export const dynamic='force-dynamic';
export const metadata={title:'運営者テーマプレビュー | Plunode',robots:{index:false,follow:false}};
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{locale?:string;revision?:string}>}){
 const {id}=await params,q=await searchParams,locale=q.locale==='en'?'en':'ja';const input=knowledgeThemeReadQuerySchema.safeParse({themeId:decodePublicEntityId(id)??'',language:locale,...(q.revision?{revision:Number(q.revision)}:{})});if(!input.success)notFound();try{await themeOperator(await headers(),{themeId:input.data.themeId,revision:input.data.revision,locale});}catch{notFound();}let value;try{value=await operatorThemePreview(input.data.themeId,locale,input.data.revision);}catch(e){if(e&&typeof e==='object'&&'status'in e&&Number(e.status)===404)notFound();throw e;}
 return <ExplorationPage locale={locale} initialKnowledgeTheme={value}/>;
}
