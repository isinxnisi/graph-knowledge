import {knowledgeThemeReadQuerySchema} from '../../../../lib/domain/knowledge-theme-reader';
import Link from 'next/link';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {themeOperator,operatorThemePreview} from '../../../../lib/server/theme-operator-preview';
import {ExplorationPage} from '../../../../lib/server/exploration-page';
export const dynamic='force-dynamic';
export const metadata={title:'運営者テーマプレビュー | Plunode',robots:{index:false,follow:false}};
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{locale?:string;revision?:string}>}){
 try{await themeOperator(await headers());}catch{notFound();}const {id}=await params,q=await searchParams,locale=q.locale==='en'?'en':'ja';const input=knowledgeThemeReadQuerySchema.safeParse({themeId:id,language:locale,...(q.revision?{revision:Number(q.revision)}:{})});if(!input.success)notFound();let value;try{value=await operatorThemePreview(input.data.themeId,locale,input.data.revision);}catch(e){if(e&&typeof e==='object'&&'status'in e&&Number(e.status)===404)notFound();throw e;}
 return <><div style={{padding:'8px 16px',fontSize:13}}>運営者プレビュー · 作業版 {value.theme.revision} · <Link href="/operations/themes">制作一覧</Link> · <Link href={'?locale='+(locale==='ja'?'en':'ja')}>{locale==='ja'?'English':'日本語'}</Link></div><ExplorationPage locale={locale} initialKnowledgeTheme={value}/></>;
}
