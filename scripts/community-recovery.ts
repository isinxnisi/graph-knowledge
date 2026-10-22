import {parseArgs} from 'node:util';
import {memberConfig} from '../lib/server/member/config';
import {memberPool} from '../lib/server/member/auth';
import {MemberError} from '../lib/server/member/http';
import {decideCommunityRecovery} from '../lib/server/member/community-recovery';
let pool:ReturnType<typeof memberPool>|undefined;
try{
 const {values,positionals}=parseArgs({allowPositionals:true,options:{actor:{type:'string'},case:{type:'string'},revision:{type:'string'},origin:{type:'string'},apply:{type:'boolean',default:false},confirm:{type:'string'},readmit:{type:'boolean',default:false}}});
 const config=memberConfig();if(!config||positionals.length!==2||values.origin!==config.origin||values.apply&&values.confirm!==positionals[1])throw Error();
 pool=memberPool(config);
 console.log(JSON.stringify(await decideCommunityRecovery(pool,{readmit:values.readmit,decision:positionals[0] as 'approve'|'reject',requestId:positionals[1],expectedRevision:Number(values.revision),actor:values.actor??'',caseReference:values.case??''},values.apply)));
}catch(error){if(error instanceof MemberError)console.error(error.code);console.error('運営復帰の判断を完了できませんでした。origin・申請UUID・期待版・actor・case・適用確認を確認してください。秘密情報は出力していません。');process.exitCode=1;}finally{await pool?.end();}
