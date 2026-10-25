import {Pool} from 'pg';
import {memberConfig} from '../../lib/server/member/config';

// Each isolated test case starts with a fresh allowance. Quota behavior itself
// is tested with real concurrent SQL/API requests in the safety integration suite.
export async function resetCommunityTestAllowance() {
 const config=memberConfig();
 if(!config||config.provider.kind!=='fixture'||process.env.NODE_ENV==='production')throw Error('Disposable community fixture only');
 const pool=new Pool({connectionString:config.databaseUrl});
 try{await pool.query('DELETE FROM community_rate');}finally{await pool.end();}
}
