import {ThemeReadingPage,themeMetadata} from "../../../lib/server/theme-reading-page";
export const dynamic="force-dynamic";
type Props={params:Promise<{themeId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>};
async function ref(p:Props){const {themeId}=await p.params,q=await p.searchParams;const revision=typeof q.krev==="string"&&/^[1-9]\d*$/.test(q.krev)?Number(q.krev):undefined;return {id:themeId,revision,stateful:Object.keys(q).some(k=>q[k]!==undefined)};}
export async function generateMetadata(p:Props){const r=await ref(p);return themeMetadata(r.id,"ja",r.revision,r.stateful);}
export default async function Page(p:Props){return <ThemeReadingPage {...await ref(p)} locale="ja"/>;}
