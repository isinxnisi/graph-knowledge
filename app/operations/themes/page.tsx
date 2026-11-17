import Link from 'next/link';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {themeOperator,operatorThemeList} from '../../../lib/server/theme-operator-preview';
export const dynamic='force-dynamic';
export const metadata={title:'テーマ制作 | Plunode',robots:{index:false,follow:false}};
export default async function Page(){let owner;try{owner=await themeOperator(await headers());}catch{notFound();}const rows=await operatorThemeList(owner);
 return <main style={{maxWidth:1000,margin:'auto',padding:'24px 16px'}}><h1>テーマ制作</h1><p>制作中の内容は運営者プレビューで確認できます。一般公開は独立した見直しの完了後に切り替わります。</p><ul style={{paddingLeft:20}}>{rows.map(r=><li key={r.id} style={{padding:'12px 0',borderBottom:'1px solid #dbe3e9'}}><span>{r.label} · </span><Link href={'/operations/themes/'+encodeURIComponent(r.id)}>{r.title}</Link><small style={{display:'block'}}>作業版 {r.current_revision} ／ 公開版 {r.published_revision??'なし'}</small>{r.work?.progress.unfinished.length>0&&<ul>{r.work.progress.unfinished.map((v:string,i:number)=><li key={i}>{v}</li>)}</ul>}</li>)}</ul></main>;
}
