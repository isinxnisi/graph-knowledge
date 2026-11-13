import {headers} from 'next/headers';
import Link from '../../components/NavigationLink';
import {verifyOAuthQueryParams} from '@better-auth/oauth-provider';
import {memberRuntime} from '../../lib/server/member/runtime';
import {missionMcpEnabled,chatGptClientUrl,signedMissionOAuthQuery,MISSION_SCOPE,THEME_COMPOSE_SCOPE,themeComposeScopeEnabled} from '../../lib/server/member/mission-oauth';
import {isSiteOperator} from '../../lib/server/member/site-operations';
import {MissionConnection} from './ui';

export const dynamic='force-dynamic';
export const metadata={title:'資料収集の接続 | Plunode',robots:{index:false,follow:false}};
export default async function CollectionConnect({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 let state:'invalid'|'login'|'operator-required'|'consent'='invalid',query='',host='',compose=false;
 try{
  if(!missionMcpEnabled())throw Error();
  const p=new URLSearchParams();for(const[k,v]of Object.entries(await searchParams))for(const value of Array.isArray(v)?v:v?[v]:[])p.append(k,value);
  query=signedMissionOAuthQuery(p);
  const {auth,pool}=memberRuntime(),context=await auth.$context;
  const signed=new URLSearchParams(query),scopes=(signed.get('scope')??'').split(' ').filter(Boolean);
  const allowed=[MISSION_SCOPE,'offline_access',...(themeComposeScopeEnabled()?[THEME_COMPOSE_SCOPE]:[])];
  if(!await verifyOAuthQueryParams(query,context.secret)||!chatGptClientUrl(signed.get('client_id')??'')||!scopes.includes(MISSION_SCOPE)||scopes.some(s=>!allowed.includes(s)))throw Error();
  compose=scopes.includes(THEME_COMPOSE_SCOPE);
  host=new URL(signed.get('redirect_uri')??'').host;
  const h=await headers(),session=await auth.api.getSession({headers:h});
  if(!session)state='login';
  else if(!isSiteOperator(session.user.id)||!(await pool.query('SELECT 1 FROM "user" WHERE id=$1 AND active',[session.user.id])).rowCount)state='operator-required';
  else{await auth.api.getOAuthClientPublic({headers:h,query:{client_id:signed.get('client_id')!}});state='consent';}
 }catch{state='invalid';query='';}
 return <main className="mission-connect"><Link href="/">Plunode</Link><h1>{compose?'ChatGPTからテーマ・資料を届ける':'ChatGPTから資料を届ける'}</h1><MissionConnection state={state} query={query} host={host} compose={compose}/></main>;
}
