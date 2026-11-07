import {expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createMissionMcpHandler} from '../lib/server/knowledge-mission-mcp';
import {chatGptClientUrl,signedMissionOAuthQuery} from '../lib/server/member/mission-oauth';
import {PROTOCOL_VERSION_META_KEY,CLIENT_INFO_META_KEY,CLIENT_CAPABILITIES_META_KEY} from '@modelcontextprotocol/server';

const rpc=(method:string,params:Record<string,unknown>)=>new Request('https://graph-beta.isinxnisi.com/api/knowledge-collection/mcp',{
 method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':method,...(typeof params.name==='string'?{'mcp-name':params.name}:{})},
 body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{[PROTOCOL_VERSION_META_KEY]:'2026-07-28',[CLIENT_INFO_META_KEY]:{name:'plunode-test',version:'1.0.0'},[CLIENT_CAPABILITIES_META_KEY]:{}}}}),
});
it('exposes only the five collection operations and their actual typed package contract',async()=>{
 const call=vi.fn(),handler=createMissionMcpHandler(call),res=await handler.fetch(rpc('tools/list',{}));
 expect(res.status,await res.clone().text()).toBe(200);const data=await res.json();
 expect(data.result.tools.map((t:{name:string})=>t.name)).toEqual(['claim_collection','observe_collection_sources','deliver_collection','finish_empty_collection','fail_collection']);
 const delivery=data.result.tools.find((t:{name:string})=>t.name==='deliver_collection');
 expect(delivery.inputSchema.properties.package.properties.items.items.properties.operation.enum).toContain('add-evidence');
 expect(call).not.toHaveBeenCalled();
});
it('binds a tool execution to the run and does not pass client-supplied credentials or paths',async()=>{
 const call=vi.fn().mockResolvedValue({ok:true,result:{state:'empty'}}),handler=createMissionMcpHandler(call),runId=randomUUID();
 const res=await handler.fetch(rpc('tools/call',{name:'finish_empty_collection',arguments:{runId,summary:'Checked the allowed public sources.'}}));
 expect(res.status,await res.clone().text()).toBe(200);expect(call).toHaveBeenCalledWith({action:'empty',runId,summary:'Checked the allowed public sources.'});
 call.mockClear();await handler.fetch(rpc('tools/call',{name:'claim_collection',arguments:{file:'/etc/passwd'}}));expect(call).not.toHaveBeenCalled();
});
it('allows only the verified ChatGPT client identity document, not arbitrary metadata fetches',()=>{
 expect(chatGptClientUrl('https://chatgpt.com/oauth/client.json')).toBe(true);
 for(const u of ['http://chatgpt.com/oauth/client.json','https://chatgpt.com.evil.example/oauth/client.json','http://127.0.0.1/private','https://chatgpt.com/oauth/client.json?key=secret'])expect(chatGptClientUrl(u)).toBe(false);
 const params=new URLSearchParams('client_id=trusted&ba_param=client_id&sig=signed&page=injected');
 expect(signedMissionOAuthQuery(params)).toBe('client_id=trusted&ba_param=client_id&sig=signed');
});
