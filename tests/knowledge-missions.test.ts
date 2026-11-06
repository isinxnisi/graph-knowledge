import {it,expect} from 'vitest';
import {missionPlanSchema,missionHostSchema,missionWorkerSchema} from '../lib/domain/knowledge-mission';
const plan={title:'Webbの装置',question:'Webbの装置が何を観測するか調べる',themeId:null,entityIds:['webb'],sourceHosts:['www.esa.int']};
it('requires a theme or core subject and keeps collection bounds explicit',()=>{
 expect(missionPlanSchema.parse(plan)).toMatchObject({intervalHours:24,maxSources:3,maxItems:5});
 expect(missionPlanSchema.safeParse({...plan,entityIds:[]}).success).toBe(false);
 expect(missionPlanSchema.safeParse({...plan,entityIds:[],themeId:'webb-theme'}).success).toBe(true);
 for(const extra of [{intervalHours:0},{maxSources:50},{maxItems:1000},{entityIds:['webb','webb']}])expect(missionPlanSchema.safeParse({...plan,...extra}).success).toBe(false);
});
it('uses exact public site names, never URL prefixes or credentials',()=>{
 expect(missionHostSchema.parse(' WWW.ESA.INT ')).toBe('www.esa.int');
 for(const host of ['https://www.esa.int/','localhost','127.0.0.1','x.local','foo.internal','user@www.esa.int','www.esa.int:443','*.esa.int'])expect(missionHostSchema.safeParse(host).success).toBe(false);
});
it('does not grant authority from arbitrary delivery fields',()=>{
 expect(missionWorkerSchema.safeParse({action:'claim',requestId:crypto.randomUUID(),approved:true}).success).toBe(false);
 expect(missionPlanSchema.safeParse({...plan,owner:'another-user',approved:true}).success).toBe(false);
});
