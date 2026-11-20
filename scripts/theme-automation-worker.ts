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
if(args.length&&(args.length!==1||args[0]!=='--once'))throw Error('Use --once or no arguments.');
const generator=configuredThemeImageGenerator(process.env,themeEnvironment(config.origin));
const pool=new Pool({connectionString:config.databaseUrl,max:4});
const worker=createThemeAutomationWorker(pool,config.origin,generator,(target,token)=>captureAutomationPreview(origin,target,token));
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stopping=true;});
let nextPrune=0;
try{
  while(!stopping){
    try{
      if(Date.now()>=nextPrune){await worker.prune();nextPrune=Date.now()+3_600_000;}
      const worked=await worker.runOnce();
      if(args.length&&!worked)break;
      if(!worked)await delay(2000);
    }catch{
      console.error(JSON.stringify({event:'theme-automation-worker-unavailable',at:new Date().toISOString()}));
      if(args.length){process.exitCode=1;break;}
      await delay(5000);
    }
  }
}finally{await pool.end();}
