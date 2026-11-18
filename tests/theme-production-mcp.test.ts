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
 const response=await handler.fetch(rpc('tools/call',{name:'get_theme_production',arguments:{}})),body=await response.json();expect(body.result.isError).not.toBe(true);expect(body.result.structuredContent).toEqual({outcome:'none',case:null});expect(call).toHaveBeenCalledWith({action:'get-theme-production',submissionCursor:0});
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
