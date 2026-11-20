import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {memberConfig} from '../lib/server/member/config';
import {themeAutomationEnabled,themeEnvironment} from '../lib/server/theme-automation-diagnostics';
import {createThemeAutomationWorker} from '../lib/server/theme-automation-worker';
import {configuredThemeImageGenerator} from '../lib/server/theme-image-generator';
import {captureAutomationPreview} from './theme-automation-browser';

const config=memberConfig();
if(!config||!themeAutomationEnabled())throw Error('Theme automation and member DB must be explicitly configured.');
const origin=process.env.THEME_AUTOMATION_PREVIEW_ORIGIN??config.origin;
if(origin!==config.origin&&!(config.origin==='https://graph-beta.isinxnisi.com'&&origin==='http://127.0.0.1:3200'))throw Error('Preview origin mismatch');
const args=process.argv.slice(2);
const trialImageId=args.length===2&&args[0]==='--beta-image-request'?args[1]:undefined;
const once=args.length===1&&args[0]==='--once';
if(args.length&&!trialImageId&&!once)throw Error('Use --once, --beta-image-request UUID or no arguments.');
const generator=configuredThemeImageGenerator(process.env,themeEnvironment(config.origin));
if(trialImageId&&process.env.GRAPH_DEPLOYMENT==='production')throw Error('The single-image trial is beta only.');
const pool=new Pool({connectionString:config.databaseUrl,max:4});
const worker=createThemeAutomationWorker(pool,config.origin,generator,(target,token)=>captureAutomationPreview(origin,target,token),trialImageId);
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stopping=true;});
let nextPrune=0;
try{
  while(!stopping){
    try{
      if(!trialImageId&&Date.now()>=nextPrune){await worker.prune();nextPrune=Date.now()+3_600_000;}
      const worked=await worker.runOnce();
      if(trialImageId&&!worked){
        const result=await worker.trialResult();
        console.log(JSON.stringify({automationId:trialImageId,...(result??{state:'not-found'})}));
        if(result?.state!=='ready')process.exitCode=1;
        break;
      }
      if(once&&!worked)break;
      if(!worked)await delay(2000);
    }catch{
      console.error(JSON.stringify({event:'theme-automation-worker-unavailable',at:new Date().toISOString()}));
      if(args.length){process.exitCode=1;break;}
      await delay(5000);
    }
  }
}finally{await pool.end();}
