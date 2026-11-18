import {Pool} from 'pg';
import {knowledgeReadConfiguration} from '../lib/server/knowledge-read-runtime';
import {repairThemeCollectionRelease} from '../lib/server/repair-theme-collection-release';
async function main(){
const args=process.argv.slice(2);
if(args.length!==1||!['--check','--apply'].includes(args[0])||process.env.KNOWLEDGE_RUNTIME!=='production'||process.env.MEMBER_ORIGIN!=='https://plunode.net')throw Error('Explicit production --check or --apply required');
const member=new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:1}),knowledge=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:1});
try{
 if((await member.query('SELECT current_database() n')).rows[0].n!=='graph_member'||(await knowledge.query('SELECT current_database() n')).rows[0].n!=='plunode_knowledge75_production')throw Error('Wrong production databases');
 console.log(JSON.stringify(await repairThemeCollectionRelease(member,knowledge,{
  themeId:'theme:915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1',parent:28,revision:29,
  parentDigest:'5138d535e15e4b41fcbab2b4ef10465b8f67be9036502ac7361225658aa2dde7',digest:'afb19054aa6dc51862f2e17ce636cb434711ebce3067f5c9ff0782b3ed2b0ce9',
  requestId:'26506f81-ac38-4b56-9748-352755a9d846',actorId:'knowledge-import:mission:a748c4c2-5d00-4747-b2f0-0d7ca5f99654',principalId:'mission:a748c4c2-5d00-4747-b2f0-0d7ca5f99654',
  record:{id:'import:mission.1ff1495d-eda2-4fd2-80c5-52d839805e79:record:96bf5d5a7587f4231bee5f03150b9ade',revision:1}
 },args[0]==='--apply')));
}finally{await member.end();await knowledge.end();}

}
main().catch(e=>{console.error(e instanceof Error?e.message:'Collection repair failed');process.exitCode=1;});
