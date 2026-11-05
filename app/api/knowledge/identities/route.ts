import {Pool} from 'pg';
import {NextResponse} from 'next/server';
import {createKnowledgeIdentity} from '../../../../lib/server/knowledge-identity';
import {knowledgeReadGuard,knowledgeReadConfiguration} from '../../../../lib/server/knowledge-read-runtime';
import {KnowledgeError} from '../../../../lib/server/knowledge-foundation';
export const runtime='nodejs';export const dynamic='force-dynamic';
let pool:Pool|undefined;
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(r:Request){try{knowledgeReadGuard(r);pool??=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:3,statement_timeout:10000});return NextResponse.json(await createKnowledgeIdentity(pool).peers(new URL(r.url).searchParams.get('id')??''),{headers});}catch(e){const status=e instanceof KnowledgeError?e.status:503;return NextResponse.json({error:status===404?'対象を閲覧できません':'現在の関連付けを取得できません'},{status,headers});}}
