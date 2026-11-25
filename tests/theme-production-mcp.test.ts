import {expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createMissionMcpHandler} from '../lib/server/knowledge-mission-mcp';
import {themeAuthoringGuide} from '../lib/server/knowledge-theme-authoring-guide';
import {PROTOCOL_VERSION_META_KEY,CLIENT_INFO_META_KEY,CLIENT_CAPABILITIES_META_KEY} from '@modelcontextprotocol/server';
const rpc=(method:string,params:Record<string,unknown>)=>new Request('https://plunode.net/api/knowledge-collection/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':method,...(typeof params.name==='string'?{'mcp-name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{[PROTOCOL_VERSION_META_KEY]:'2026-07-28',[CLIENT_INFO_META_KEY]:{name:'production-test',version:'1.0.0'},[CLIENT_CAPABILITIES_META_KEY]:{}}}})});
const names=['create_theme_production','get_theme_production','claim_theme_production','update_theme_production','prepare_theme_production_submission','dispatch_theme_production_submission'];
it('advertises the six private handoff operations with input/output schemas in the existing MCP and technical guide',async()=>{
 const call=vi.fn().mockResolvedValue({outcome:'none',case:null}),handler=createMissionMcpHandler(vi.fn(),{call});
 const r=await handler.fetch(rpc('tools/list',{})),data=await r.json();for(const name of names){const tool=data.result.tools.find((t:{name:string})=>t.name===name);expect(tool).toBeTruthy();expect(tool.inputSchema.type).toBe('object');expect(tool.outputSchema.properties.outcome).toBeTruthy();expect(tool._meta.securitySchemes[0].scopes).toContain('themes:compose');}
 const guide=themeAuthoringGuide().productionHandoff;expect(Object.values(guide.operations)).toEqual(names);expect(guide.schemas.prepare.properties?.command).toBeTruthy();
 const prepare=data.result.tools.find((t:{name:string})=>t.name==='prepare_theme_production_submission');
 expect(prepare.inputSchema.properties.generatedImage.properties.target.properties.revision.type).toBe('integer');
 const response=await handler.fetch(rpc('tools/call',{name:'get_theme_production',arguments:{}})),body=await response.json();expect(body.result.isError).not.toBe(true);expect(body.result.structuredContent).toEqual({outcome:'none',case:null});expect(call).toHaveBeenCalledWith({action:'get-theme-production',submissionCursor:0});
});
it('advertises scoped case management and forwards only the resolved theme ID',async()=>{
 const call=vi.fn().mockResolvedValue({items:[],nextCursor:null}),handler=createMissionMcpHandler(vi.fn(),{call});
 const data=await(await handler.fetch(rpc('tools/list',{}))).json();
 const list=data.result.tools.find((tool:{name:string})=>tool.name==='list_theme_productions');
 const abandon=data.result.tools.find((tool:{name:string})=>tool.name==='abandon_theme_production');
 expect(list.annotations.readOnlyHint).toBe(true);
 expect(abandon.annotations.destructiveHint).toBe(true);
 expect(list._meta.securitySchemes[0].scopes).toContain('themes:compose');
 const body=await(await handler.fetch(rpc('tools/call',{name:'list_theme_productions',arguments:{themeId:'theme',cursor:5}}))).json();
 expect(body.result.structuredContent).toEqual({items:[],nextCursor:null});
 expect(call).toHaveBeenCalledWith({action:'list-theme-productions',themeId:'theme',cursor:5});
 const blocked=await(await handler.fetch(rpc('tools/call',{name:'abandon_theme_production',arguments:{caseId:randomUUID(),requestId:randomUUID(),expectedVersion:4,reason:'  '}}))).json();
 expect(blocked.error||blocked.result?.isError).toBeTruthy();
 expect(call).toHaveBeenCalledTimes(1);
});
it('does not expose handoff to a collection-only server or bypass missing compose consent',async()=>{
 const plain=createMissionMcpHandler(vi.fn()),data=await(await plain.fetch(rpc('tools/list',{}))).json();expect(data.result.tools.some((t:{name:string})=>names.includes(t.name))).toBe(false);
 const call=vi.fn(),handler=createMissionMcpHandler(vi.fn(),{call,authChallenge:'Bearer scope="themes:compose"'}),body=await(await handler.fetch(rpc('tools/call',{name:'claim_theme_production',arguments:{requestId:randomUUID(),executionId:randomUUID(),phase:'review'}}))).json();expect(body.result.isError).toBe(true);expect(call).not.toHaveBeenCalled();
});
it('requires explicit case creation and a complete execution fence for saves; never accepts caller-selected owners or environments',async()=>{
 const call=vi.fn().mockResolvedValue({outcome:'none',case:null}),handler=createMissionMcpHandler(vi.fn(),{call});
 for(const [name,args] of [['get_theme_production',{ownerId:randomUUID()}],['create_theme_production',{requestId:randomUUID(),environment:'production',progress:{brief:'Draft',scope:'Sources'}}],['update_theme_production',{caseId:randomUUID(),operation:'complete'}]] as const){const body=await(await handler.fetch(rpc('tools/call',{name,arguments:args}))).json();expect(body.error||body.result?.isError).toBeTruthy();}
 expect(call).not.toHaveBeenCalled();
});

it('advertises manual case creation without changing scheduled defaults and forwards the explicit workflow',async()=>{
 const call=vi.fn().mockResolvedValue({outcome:'none',case:null}),handler=createMissionMcpHandler(vi.fn(),{call});
 const listing=await(await handler.fetch(rpc('tools/list',{}))).json(),tool=listing.result.tools.find((t:{name:string})=>t.name==='create_theme_production');
 expect(tool.description).toContain('workflow: manual');expect(tool.description).not.toContain('one unfinished case per operator');expect(tool.inputSchema.properties.workflow.enum).toEqual(['scheduled','manual']);expect(tool.inputSchema.required).not.toContain('workflow');
 const input={requestId:randomUUID(),workflow:'manual',phase:'production',progress:{brief:'通常チャットの別テーマ',scope:'今回の変更',artifacts:{},unfinished:[],blockers:[]}};
 const reply=await(await handler.fetch(rpc('tools/call',{name:'create_theme_production',arguments:input}))).json();expect(reply.result.isError).not.toBe(true);expect(call).toHaveBeenCalledWith({action:'create-theme-production',...input});
 expect(themeAuthoringGuide().productionHandoff.manualExample.input.workflow).toBe('manual');
});

it('exposes explicit ordinary publication to compose without weakening collection or legacy tools',async()=>{
 const publish={requestId:randomUUID(),target:{id:'theme',revision:3},base:{revision:1,releaseId:null},digest:'b'.repeat(64),reason:'確認済みの通常編集'};
 const call=vi.fn().mockResolvedValue({state:'published'});
 const handler=createMissionMcpHandler(vi.fn(),{call});
 const data=await(await handler.fetch(rpc('tools/list',{}))).json();
 const tool=data.result.tools.find((v:{name:string})=>v.name==='publish_theme');
 expect(tool.inputSchema.required).toContain('digest');
 expect(tool._meta.securitySchemes[0].scopes).toContain('themes:compose');
 expect(data.result.tools.map((v:{name:string})=>v.name)).toEqual(expect.arrayContaining(['claim_collection','deliver_collection',...names]));
 await handler.fetch(rpc('tools/call',{name:'publish_theme',arguments:publish}));
 expect(call).toHaveBeenCalledWith({action:'publish-theme',...publish});
 call.mockClear();
 const denied=createMissionMcpHandler(vi.fn(),{call,authChallenge:'Bearer scope="themes:compose"'});
 const rejected=await(await denied.fetch(rpc('tools/call',{name:'publish_theme',arguments:publish}))).json();
 expect(rejected.result.isError).toBe(true);
 expect(call).not.toHaveBeenCalled();
});

it('exposes case automation under compose consent and returns screenshot bytes as MCP image content',async()=>{
 const args={requestId:randomUUID(),caseId:randomUUID(),executionId:randomUUID(),leaseToken:randomUUID(),expectedVersion:7,automationId:randomUUID(),name:'ja-390-timeline-image.png'};
 const call=vi.fn().mockResolvedValue({metadata:{name:args.name},image:Buffer.from('test bytes')});
 const handler=createMissionMcpHandler(vi.fn(),{call,automationEnabled:true});
 const listing=await(await handler.fetch(rpc('tools/list',{}))).json();
 const n='read_theme_review_evidence';
 for(const name of ['generate_theme_image','capture_theme_review_preview','read_theme_automation','report_theme_external_blocker',n]){
  expect(listing.result.tools.find((v:{name:string})=>v.name===name)?._meta.securitySchemes[0].scopes).toContain('themes:compose');
 }
 const schema=listing.result.tools.find((v:{name:string})=>v.name===n).inputSchema.properties.name;
 expect(new RegExp(schema.pattern).test('en-1440-timeline-image.png')).toBe(true);
 expect(new RegExp(schema.pattern).test('en-1440-other.png')).toBe(false);
 const result=await(await handler.fetch(rpc('tools/call',{name:n,arguments:args}))).json();
 expect(result.result.content).toContainEqual({type:'image',mimeType:'image/png',data:Buffer.from('test bytes').toString('base64')});
 expect(call).toHaveBeenCalledWith({action:'read-theme-evidence',...args});
 call.mockClear();
 const denied=createMissionMcpHandler(vi.fn(),{call,automationEnabled:true,authChallenge:'Bearer scope="themes:compose"'});
 const rejected=await(await denied.fetch(rpc('tools/call',{name:n,arguments:args}))).json();
 expect(rejected.result.isError).toBe(true);
 expect(call).not.toHaveBeenCalled();
});

it('discovers versioned work-guide tools under compose and forwards only their declared inputs',async()=>{
 const call=vi.fn().mockResolvedValue({contractVersion:2}),handler=createMissionMcpHandler(vi.fn(),{call});
 const listing=await(await handler.fetch(rpc('tools/list',{}))).json();
 const tools=listing.result.tools;
 for(const name of ['read_theme_work_guide','update_theme_work_guide']){
  expect(tools.find((tool:{name:string})=>tool.name===name)._meta.securitySchemes[0].scopes).toContain('themes:compose');
 }
 const input={phase:'review',caseId:randomUUID(),focuses:['images']};
 const reply=await(await handler.fetch(rpc('tools/call',{name:'read_theme_work_guide',arguments:input}))).json();
 expect(reply.result.isError).not.toBe(true);
 expect(call).toHaveBeenCalledWith({action:'read-work-guide',...input});
 const update={expectedRevision:4,requestId:randomUUID(),reason:'Restore current beta guide',restoreRevision:2};
 await handler.fetch(rpc('tools/call',{name:'update_theme_work_guide',arguments:update}));
 expect(call).toHaveBeenCalledWith({action:'update-work-guide',...update});
});

it('publishes a management page as MCP structured content with a text fallback',async()=>{
 const page={versions:{revision:9},content:{required:{principles:'Guide'},sections:[{key:'images',bodyKey:'images'}]},history:[{revision:9}]};
 const call=vi.fn().mockResolvedValue(page),handler=createMissionMcpHandler(vi.fn(),{call});
 const response=await(await handler.fetch(rpc('tools/call',{name:'read_theme_work_guide',arguments:{phase:'production',management:true}}))).json();
 expect(response.result.structuredContent).toEqual(page);
 expect(JSON.parse(response.result.content[0].text)).toEqual(page);
 const input={phase:'production',management:true,revision:9,managementBody:{key:'assistance-'+('a'.repeat(64)),offset:0}};
 await handler.fetch(rpc('tools/call',{name:'read_theme_work_guide',arguments:input}));
 expect(call).toHaveBeenLastCalledWith({action:'read-work-guide',...input,focuses:[]});
 const normal=await(await handler.fetch(rpc('tools/call',{name:'read_theme_work_guide',arguments:{phase:'production'}}))).json();
 expect(normal.result.structuredContent).toBeUndefined();
});

it('exposes continuity inputs and the authenticated cross-case follow-up list',async()=>{
 const call=vi.fn().mockResolvedValue({items:[],nextCursor:null}),handler=createMissionMcpHandler(vi.fn(),{call});
 const data=await(await handler.fetch(rpc('tools/list',{}))).json();
 const tool=(name:string)=>data.result.tools.find((value:{name:string})=>value.name===name);
 expect(tool('abandon_theme_production').inputSchema.properties.park.properties.resumeWhen.type).toBe('string');
 expect(tool('claim_theme_production').inputSchema.properties.resume.properties.expectedVersion.type).toBe('integer');
 expect(tool('update_theme_production').inputSchema.properties.followUps.items.properties.record.properties.status.enum).toEqual(['open','resolved']);
 expect(tool('list_theme_production_follow_ups')._meta.securitySchemes[0].scopes).toContain('themes:compose');
 const response=await handler.fetch(rpc('tools/call',{name:'list_theme_production_follow_ups',arguments:{query:'archival image'}}));
 expect((await response.json()).result.structuredContent).toEqual({items:[],nextCursor:null});
 expect(call).toHaveBeenCalledWith({action:'list-theme-production-follow-ups',query:'archival image',cursor:0});
});
