import {afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {themeRegistrationInputSchema,themeUpdateInputSchema} from '../lib/domain/knowledge-theme-registration';
import {grantedThemeComposeScope} from '../lib/server/member/mission-oauth';
import {createMissionMcpHandler} from '../lib/server/knowledge-mission-mcp';
import {PROTOCOL_VERSION_META_KEY,CLIENT_INFO_META_KEY,CLIENT_CAPABILITIES_META_KEY} from '@modelcontextprotocol/server';
afterEach(()=>vi.unstubAllEnvs());
const request=()=>({requestId:randomUUID(),title:'Aの足跡',recordPins:[{id:'record',revision:1}]});
it('accepts a composition from existing public pins without inventing new facts',()=>{
 expect(themeRegistrationInputSchema.parse(request())).toMatchObject({package:null,recordPins:[{id:'record',revision:1}]});
 expect(()=>themeRegistrationInputSchema.parse({...request(),recordPins:[]})).toThrow('根拠付き項目');
});
it('does not expand an existing collection token or confuse similarly named scopes',()=>{
 vi.stubEnv('KNOWLEDGE_THEME_REGISTRATION_ENABLED','1');
 for(const value of ['missions:collect','themes:compose-other',['themes:compose'],undefined])expect(grantedThemeComposeScope(value)).toBe(false);
 expect(grantedThemeComposeScope('missions:collect themes:compose offline_access')).toBe(true);
 vi.stubEnv('KNOWLEDGE_THEME_REGISTRATION_ENABLED','0');expect(grantedThemeComposeScope('themes:compose')).toBe(false);
});
const rpc=(method:string,params:Record<string,unknown>)=>new Request('https://plunode.net/api/knowledge-collection/mcp',{
 method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':method,...(typeof params.name==='string'?{'mcp-name':params.name}:{})},
 body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{[PROTOCOL_VERSION_META_KEY]:'2026-07-28',[CLIENT_INFO_META_KEY]:{name:'theme-test',version:'1.0.0'},[CLIENT_CAPABILITIES_META_KEY]:{}}}}),
});
it('adds typed creation/status/cancellation only to the explicitly authorized handler',async()=>{
 const collect=vi.fn(),compose=vi.fn().mockResolvedValue({state:'saved'});
 const old=createMissionMcpHandler(collect),handler=createMissionMcpHandler(collect,{call:compose});
 const absent=await(await old.fetch(rpc('tools/call',{name:'submit_theme',arguments:request()}))).json();expect(absent.error||absent.result?.isError).toBeTruthy();expect(compose).not.toHaveBeenCalled();
 const tools=(await(await handler.fetch(rpc('tools/list',{}))).json()).result.tools;
 expect(tools).toHaveLength(28);expect(tools.find((v:{name:string})=>v.name==='submit_theme').inputSchema.properties.package).toBeDefined();
 const input=request();await handler.fetch(rpc('tools/call',{name:'submit_theme',arguments:input}));expect(compose).toHaveBeenCalledWith(expect.objectContaining({action:'submit-theme',requestId:input.requestId,title:input.title}));expect(collect).not.toHaveBeenCalled();
 compose.mockClear();await handler.fetch(rpc('tools/call',{name:'submit_theme',arguments:{...input,credential:'secret',origin:'https://other.example'}}));expect(compose).not.toHaveBeenCalled();
});

it('describes source URL registration and directly exposes update/read/guide without a collection lease',async()=>{
 const compose=vi.fn().mockResolvedValue({ok:true}),handler=createMissionMcpHandler(vi.fn(),{call:compose});
 const tools=(await(await handler.fetch(rpc('tools/list',{}))).json()).result.tools;
 for(const name of ['get_theme_authoring_guide','read_theme','search_themes','update_theme','read_theme_knowledge'])expect(tools.some((t:{name:string})=>t.name===name)).toBe(true);
 expect(tools.find((t:{name:string})=>t.name==='submit_theme').description).toContain('package.sources[].content.url');
 await handler.fetch(rpc('tools/call',{name:'get_theme_authoring_guide',arguments:{}}));expect(compose).toHaveBeenLastCalledWith({action:'theme-guide'});
 const update={requestId:randomUUID(),target:{id:'theme',revision:1},changes:{title:'Updated'},reason:'Improve the title'};
 await handler.fetch(rpc('tools/call',{name:'update_theme',arguments:update}));expect(compose).toHaveBeenLastCalledWith(expect.objectContaining({action:'update-theme',target:update.target,changes:update.changes}));
 compose.mockResolvedValueOnce({ok:false,code:'REVISION_CONFLICT',message:'Read the current theme'});
 expect((await(await handler.fetch(rpc('tools/call',{name:'update_theme',arguments:update}))).json()).result.isError).toBe(true);
});
it('requires an explicit target/reason and preserves omitted update fields instead of replacing the theme',()=>{
 const update={requestId:randomUUID(),target:{id:'theme',revision:3},changes:{description:''},reason:'Clear the introduction'};
 expect(themeUpdateInputSchema.parse(update)).toMatchObject({changes:{description:''},recordPins:[],removeRecordIds:[],package:null});
 expect(()=>themeUpdateInputSchema.parse({...update,target:undefined})).toThrow();
 expect(()=>themeUpdateInputSchema.parse({...update,changes:{}})).toThrow();
 expect(()=>themeUpdateInputSchema.parse({...update,recordPins:[{id:'a',revision:1}],removeRecordIds:['a']})).toThrow();
});

it('lets an old operator connection discover new tools but challenges before executing without compose scope',async()=>{
 const compose=vi.fn(),challenge='Bearer error="insufficient_scope", scope="missions:collect themes:compose"';
 const handler=createMissionMcpHandler(vi.fn(),{call:compose,authChallenge:challenge});
 const list=(await(await handler.fetch(rpc('tools/list',{}))).json()).result.tools;
 expect(list).toHaveLength(28);expect(list.find((v:{name:string})=>v.name==='update_theme')._meta.securitySchemes).toEqual([{type:'oauth2',scopes:['missions:collect','themes:compose']}]);
 const res=(await(await handler.fetch(rpc('tools/call',{name:'get_theme_authoring_guide',arguments:{}}))).json()).result;
 expect(res.isError).toBe(true);expect(res._meta['mcp/www_authenticate']).toEqual([challenge]);expect(compose).not.toHaveBeenCalled();
});

it('exposes guide read/history and guarded update without changing technical schemas',async()=>{
 const dispatch=vi.fn(async(command)=>({id:'theme-authoring-quality',revision:2,command}));const handler=createMissionMcpHandler(vi.fn(),{call:dispatch});
 const list=(await(await handler.fetch(rpc('tools/list',{}))).json()).result.tools;
 expect(list.find((v:{name:string})=>v.name==='read_theme_quality_guide').annotations.readOnlyHint).toBe(true);
 const result=(await(await handler.fetch(rpc('tools/call',{name:'read_theme_quality_guide',arguments:{revision:1}}))).json()).result;
 expect(result.isError).not.toBe(true);expect(dispatch).toHaveBeenCalledWith({action:'read-quality-guide',revision:1});
 const guarded=createMissionMcpHandler(vi.fn(),{call:dispatch,authChallenge:'Bearer error="insufficient_scope"'});dispatch.mockClear();
 const rejected=(await(await guarded.fetch(rpc('tools/call',{name:'update_theme_quality_guide',arguments:{requestId:'11111111-1111-4111-8111-111111111111',expectedRevision:0,markdown:'# guide',reason:'初版'}}))).json()).result;
 expect(rejected.isError).toBe(true);expect(dispatch).not.toHaveBeenCalled();
});
