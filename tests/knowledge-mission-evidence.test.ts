import {expect,it} from 'vitest';
import {validateMissionPackage,type MissionSnapshot} from '../lib/server/knowledge-missions';
import {knowledgeRecordContentSchema,knowledgeEntityContentSchema} from '../lib/domain/knowledge-foundation';
const pin={id:'baseline',revision:1},sourcePin={id:'source',revision:1};
const content=knowledgeRecordContentSchema.parse({kind:'note',subjectId:'a',assertion:'A exists.',evidence:[{id:'old',source:sourcePin,locator:'Original',excerpt:'A exists.'}]});
const snapshot:MissionSnapshot={plan:{title:'A',question:'Research A.',themeId:null,entityIds:['a'],sourceHosts:['example.org'],intervalHours:24,maxSources:1,maxItems:1},theme:null,entities:[{id:'a',revision:1,content:knowledgeEntityContentSchema.parse({name:'A',kind:'work'}),createdAt:'',reason:''}],records:[pin],recordDetails:[{...pin,content,createdAt:'',reason:''}]};
const extra={id:'new',source:sourcePin,stance:'support' as const,locator:'Further passage',excerpt:'More evidence about A.'};
function packageWith(record:unknown){return {format:'plunode-knowledge-package',schemaVersion:1,namespace:'mission.plan',packageId:'run.run',revision:1,entityPins:[{id:'a',revision:1}],sourcePins:[sourcePin],items:[{key:'extra',operation:'add-evidence',about:{kind:'record',...pin},correction:pin,record}]};}
const source=async()=>({content:{url:'https://example.org/source'}});
it.each([
 ['self reference',{...content,aboutRecord:pin,evidence:[...content.evidence,extra]}],
 ['replacement evidence',{...content,evidence:[extra]}],
])('rejects %s before durable mission intake, then accepts a repaired package',async(_label,record)=>{
 await expect(validateMissionPackage(packageWith(record),snapshot,'run','plan',source)).rejects.toMatchObject({code:'MISSION_EVIDENCE_BASELINE'});
 const repaired=packageWith({...content,evidence:[...content.evidence,extra]});
 const before=JSON.stringify(repaired);
 await expect(validateMissionPackage(repaired,snapshot,'run','plan',source)).resolves.toMatchObject({items:[{operation:'add-evidence'}]});
 expect(JSON.stringify(repaired)).toBe(before);
});
