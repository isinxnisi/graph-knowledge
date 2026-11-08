import {afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {themeRegistrationInputSchema} from '../lib/domain/knowledge-theme-registration';
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
 expect(tools).toHaveLength(8);expect(tools.find((v:{name:string})=>v.name==='submit_theme').inputSchema.properties.package).toBeDefined();
 const input=request();await handler.fetch(rpc('tools/call',{name:'submit_theme',arguments:input}));expect(compose).toHaveBeenCalledWith(expect.objectContaining({action:'submit-theme',requestId:input.requestId,title:input.title}));expect(collect).not.toHaveBeenCalled();
 compose.mockClear();await handler.fetch(rpc('tools/call',{name:'submit_theme',arguments:{...input,credential:'secret',origin:'https://other.example'}}));expect(compose).not.toHaveBeenCalled();
});
