import {Pool} from 'pg';
import {repairOperatorTranslationPrivacy} from '../lib/server/knowledge-operator-intake';
import {isSiteOperator} from '../lib/server/member/site-operations';
const apply=process.argv.includes('--apply');
if(!process.argv.includes('--plan')&&!apply)throw new Error('Use --plan or --apply after a protected backup');
const pool=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:1});
try{
 const owners=(await pool.query('SELECT DISTINCT owner_id FROM member_knowledge.submissions ORDER BY owner_id')).rows.map(r=>r.owner_id as string).filter(isSiteOperator);
 const result=await repairOperatorTranslationPrivacy(pool,owners,apply);
 // Authenticated owner IDs stay in the private database, never in public logs.
 console.log(JSON.stringify(result));
}finally{await pool.end();}
