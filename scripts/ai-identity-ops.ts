import {parseArgs} from 'node:util';
import {memberConfig} from '../lib/server/member/config';
import {memberPool} from '../lib/server/member/auth';
import {operateAiIdentity} from '../lib/server/member/ai-identity';
const {values}=parseArgs({options:{id:{type:'string'},status:{type:'string'},actor:{type:'string'},reason:{type:'string'},apply:{type:'boolean',default:false},'confirm-origin':{type:'string'}}});
const config=memberConfig();if(!config)throw Error('Explicit member configuration required');
if(values.apply&&values['confirm-origin']!==config.origin)throw Error('Applying requires an explicit matching --confirm-origin');
const pool=memberPool(config);
try{console.log(JSON.stringify(await operateAiIdentity(pool,{id:values.id,status:values.status,actor:values.actor,reason:values.reason},values.apply)));}finally{await pool.end();}
