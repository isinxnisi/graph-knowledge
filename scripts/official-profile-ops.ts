import {parseArgs} from 'node:util';
import {memberConfig} from '../lib/server/member/config';
import {memberPool} from '../lib/server/member/auth';
import {designateOfficialProfile} from '../lib/server/member/official-profile';
const {values}=parseArgs({options:{'expected-handle':{type:'string'},'google-subject-sha256':{type:'string'},actor:{type:'string'},reason:{type:'string'},apply:{type:'boolean',default:false},'confirm-origin':{type:'string'}}});
const config=memberConfig();if(!config)throw Error('Explicit member configuration required');
if(values.apply&&values['confirm-origin']!==config.origin)throw Error('Applying requires an explicit matching --confirm-origin');
const pool=memberPool(config);
try{console.log(JSON.stringify(await designateOfficialProfile(pool,{email:process.env.PROFILE_OFFICIAL_EMAIL,expectedHandle:values['expected-handle'],expectedGoogleSubjectHash:values['google-subject-sha256'],actor:values.actor,reason:values.reason},values.apply)));}
catch{console.error('Official profile operation failed; check verified Google identity, expected handle and reserved handle ownership');process.exitCode=1;}
finally{await pool.end();}
