import {parseArgs} from 'node:util';
import {memberConfig} from '../lib/server/member/config';
import {memberPool} from '../lib/server/member/auth';
import {MemberError} from '../lib/server/member/http';
import {communityReportQueue,operateCommunitySafety,type CommunitySafetyOperation} from '../lib/server/member/community-site-safety';

let pool:ReturnType<typeof memberPool>|undefined;
try {
 const {values,positionals}=parseArgs({allowPositionals:true,options:{origin:{type:'string'},actor:{type:'string'},case:{type:'string'},reason:{type:'string'},revision:{type:'string'},'report-revision':{type:'string'},after:{type:'string'},apply:{type:'boolean',default:false},confirm:{type:'string'}}});
 const config=memberConfig();if(!config||values.origin!==config.origin)throw Error();
 pool=memberPool(config);
 if(positionals[0]==='queue'&&positionals.length===1&&!values.apply) {
  console.log(JSON.stringify(await communityReportQueue(pool,values.after)));
 } else {
  if(positionals.length!==2||values.apply&&values.confirm!==positionals[1])throw Error();
  const input:CommunitySafetyOperation={action:positionals[0] as CommunitySafetyOperation['action'],reportId:positionals[1],actor:values.actor??'',caseReference:values.case??'',reason:values.reason??'',expectedRevision:Number(values.revision),expectedReportRevision:Number(values['report-revision'])};
  console.log(JSON.stringify(await operateCommunitySafety(pool,input,values.apply)));
 }
} catch(error) {
 if(error instanceof MemberError)console.error(error.code);
 console.error('安全管理を完了できませんでした。origin・通報UUID・期待版・actor・case・理由・適用確認を確認してください。秘密情報は出力していません。');process.exitCode=1;
} finally {await pool?.end();}
