import {z} from 'zod';
import {runMissionClient} from '../../scripts/knowledge-mission-client';

const run={runId:z.uuidv4()};
export const missionToolCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('claim')}),
 z.strictObject({...run,action:z.literal('observe'),urls:z.array(z.url().max(2000)).min(1).max(5)}),
 z.strictObject({...run,action:z.literal('deliver'),package:z.json()}),
 z.strictObject({...run,action:z.literal('empty'),summary:z.string().trim().min(1).max(1000)}),
 z.strictObject({...run,action:z.literal('fail'),reason:z.enum(['network','source-unavailable','search-unavailable','limit','invalid-package'])}),
]);
export type MissionToolCommand=z.infer<typeof missionToolCommandSchema>;
export type MissionToolResult={ok:true;result:unknown}|{ok:false;code:string;canRepair?:boolean;hint?:string};

/** A transport adapter supplies JSON, never a path, shell command, credential or
 * a new service origin. The server-owned client retains the private run token. */
export function createMissionToolBridge(clientFile:string,execute:typeof runMissionClient=runMissionClient){
 let tail:Promise<unknown>=Promise.resolve();
 return {
  call(raw:unknown):Promise<MissionToolResult>{
   const task=tail.then(async():Promise<MissionToolResult>=>{
    const parsed=missionToolCommandSchema.safeParse(raw);
    if(!parsed.success)return {ok:false,code:'INVALID_ARGUMENT'};
    const command=parsed.data;
    try{
     const result=command.action==='claim'?await execute([clientFile,'claim']):await execute([clientFile,command.action],{
      expectedRunId:command.runId,
      payload:command.action==='observe'?command.urls:command.action==='deliver'?command.package:command.action==='empty'?command.summary:command.reason,
     });
     return {ok:true,result};
    }catch(error){
     const code=error instanceof Error&&/^[A-Z][A-Z0-9_]{1,80}$/.test(error.message)?error.message:'DELIVERY_UNAVAILABLE';
     if(command.action==='deliver'&&code==='MISSION_THEME_CHANGED')return {ok:false,code,canRepair:true,hint:'Every item.themes must contain exactly the claimed snapshot.theme id and revision, including add-evidence. Repair that pin and retry deliver_collection in this same run; do not switch to the current theme or record this as a research failure.'};
     if(command.action==='deliver'&&code==='MISSION_EVIDENCE_BASELINE')return {ok:false,code,canRepair:true,hint:'For add-evidence, copy the target snapshot.recordDetails entry content unchanged, including all existing evidence and any aboutRecord/aboutTheme. Append new evidence with a new id. Put the target pin in item.about (kind record) and item.correction, not a new record.aboutRecord self-reference. Keep existing source pins and retry in this same run; do not replace the original fact or evidence.'};
     return {ok:false,code};
    }
   });
   tail=task.catch(()=>undefined);return task;
  }
 };
}
