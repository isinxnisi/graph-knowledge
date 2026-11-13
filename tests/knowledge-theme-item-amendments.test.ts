import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {amendThemeRegistrationSchema} from '../lib/domain/knowledge-theme-registration';
import {knowledgeImportPackageSchema} from '../lib/domain/knowledge-import';
import {processingAmendedInput} from '../lib/server/knowledge-theme-item-amendments';
import {importItemOperationId} from '../lib/server/knowledge-import-plan';
import {createMissionMcpHandler} from '../lib/server/knowledge-mission-mcp';
import {PROTOCOL_VERSION_META_KEY,CLIENT_INFO_META_KEY,CLIENT_CAPABILITIES_META_KEY} from '@modelcontextprotocol/server';
const item={key:'G07',operation:'add-information',about:{kind:'entity',id:'a',revision:1},record:{kind:'note',subjectId:'a',assertion:'A fact.',evidence:[{id:'q',source:{id:'s',revision:1},locator:'Body',excerpt:'A fact.'}]}};
const input=()=>({requestId:randomUUID(),registrationRequestId:randomUUID(),reason:'Correct source',items:[{key:'G07',expectedRevision:1,item}]});
it('requires explicit item revisions and stable keys without defaulting omitted resource arrays to empty',()=>{
 const v=input();expect(amendThemeRegistrationSchema.parse(v).items[0]).not.toHaveProperty('entities');
 expect(amendThemeRegistrationSchema.safeParse({...v,items:[{...v.items[0],expectedRevision:undefined}]}).success).toBe(false);
 expect(amendThemeRegistrationSchema.safeParse({...v,items:[{...v.items[0],key:'other'}]}).success).toBe(false);
 expect(amendThemeRegistrationSchema.safeParse({...v,items:[v.items[0],v.items[0]]}).success).toBe(false);
});
it('retains unchanged resource identities but gives changed resources stable isolated identities',()=>{
 const base=knowledgeImportPackageSchema.parse({format:'plunode-knowledge-package',schemaVersion:1,namespace:'fixture',packageId:'fixture',revision:1,sources:[{id:'s',content:{title:'Source',url:'https://example.org/old'}}],items:[item]});
 expect(processingAmendedInput(base,base)).toEqual(base);const next={...base,sources:[{id:'s',content:{title:'New source',url:'https://example.org/new'}}]};
 const changed=processingAmendedInput(base,next),id=(changed.sources[0] as {id:string}).id;expect(id).not.toBe('s');expect(changed.items[0]).toMatchObject({record:{evidence:[{source:{id}}]}});expect(processingAmendedInput(base,next)).toEqual(changed);expect(next.items[0]).toEqual(item);
});
it('keeps old operation ids stable and isolates each amended commit',()=>{
 const id=randomUUID();expect(importItemOperationId({id})).toBe(id);expect(importItemOperationId({id,input_revision:1})).toBe(id);expect(importItemOperationId({id,input_revision:2})).not.toBe(id);expect(importItemOperationId({id,input_revision:2})).not.toBe(importItemOperationId({id,input_revision:3}));
});
it('exposes typed amendment/status tools only on the authorized compose handler',async()=>{
 const call=vi.fn(async v=>({ok:true,action:v.action})),handler=createMissionMcpHandler(vi.fn(),{call});
 const rpc=async(method:string,params:Record<string,unknown>)=>{const response=await handler.fetch(new Request('https://fixture.example/api/knowledge-collection/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':method,...(typeof params.name==='string'?{'mcp-name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{[PROTOCOL_VERSION_META_KEY]:'2026-07-28',[CLIENT_INFO_META_KEY]:{name:'amendment-test',version:'1'},[CLIENT_CAPABILITIES_META_KEY]:{}}}})}));return JSON.parse(await response.text());};
 const listed=await rpc('tools/list',{});expect(listed.result.tools.some((t:{name:string})=>t.name==='amend_theme_registration')).toBe(true);
 await rpc('tools/call',{name:'amend_theme_registration',arguments:input()});expect(call).toHaveBeenLastCalledWith(expect.objectContaining({action:'amend-theme-items'}));
 const base=createMissionMcpHandler(vi.fn());const res=await base.fetch(new Request('https://fixture.example/api/knowledge-collection/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':'tools/list'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{_meta:{[PROTOCOL_VERSION_META_KEY]:'2026-07-28',[CLIENT_INFO_META_KEY]:{name:'test',version:'1'},[CLIENT_CAPABILITIES_META_KEY]:{}}}})}));expect((await res.text())).not.toContain('amend_theme_registration');
});
