import {expect,it,vi,afterEach} from 'vitest';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {readThemeTranslationSchema,submitThemeTranslationSchema} from '../lib/domain/knowledge-theme-translation';
import {themeRegistrationCommandSchema} from '../lib/domain/knowledge-theme-registration';
import {themeTranslationCapture,themeTranslationOperationId} from '../lib/server/knowledge-theme-translation';
import {themeAuthoringGuide} from '../lib/server/knowledge-theme-authoring-guide';
import {createMissionMcpHandler} from '../lib/server/knowledge-mission-mcp';
import {PROTOCOL_VERSION_META_KEY,CLIENT_INFO_META_KEY,CLIENT_CAPABILITIES_META_KEY} from '@modelcontextprotocol/server';
afterEach(()=>vi.unstubAllEnvs());
const target={kind:'theme' as const,id:'theme',revision:3,field:'title' as const};
const input=()=>({requestId:randomUUID(),theme:{id:'theme',revision:3},translation:{target,language:'en',text:'A theme',expectedRevision:0}});
const rpc=(method:string,params:Record<string,unknown>)=>new Request('https://plunode.net/api/knowledge-collection/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':method,...(typeof params.name==='string'?{'mcp-name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{[PROTOCOL_VERSION_META_KEY]:'2026-07-28',[CLIENT_INFO_META_KEY]:{name:'translation-test',version:'1'},[CLIENT_CAPABILITIES_META_KEY]:{}}}})});
it('requires the observed translation revision and rejects arbitrary fields, languages and oversize titles',()=>{
 const v=input();expect(submitThemeTranslationSchema.parse(v).attribution).toBe('profile');
 for(const translation of [{...v.translation,expectedRevision:undefined},{...v.translation,target:{...target,field:'recordPins'}},{...v.translation,language:'und'},{...v.translation,text:'x'.repeat(201)}])expect(submitThemeTranslationSchema.safeParse({...v,translation}).success).toBe(false);
 expect(readThemeTranslationSchema.safeParse({theme:v.theme,target,language:'zh-Hant'}).success).toBe(true);
});
it('binds immutable resumption to the authenticated owner, complete proposal and exact theme pin',()=>{
 const owner=randomUUID(),v=submitThemeTranslationSchema.parse(input()),cmd=themeTranslationCapture(owner,v);
 expect(z.uuidv4().parse(cmd.id)).toBe(cmd.id);expect(themeTranslationCapture(owner,v)).toEqual(cmd);
 expect(themeTranslationOperationId(randomUUID(),v.requestId,'submission')).not.toBe(cmd.id);
 expect(new Set(['submission','capture','submit','review','cancel'].map(s=>themeTranslationOperationId(owner,v.requestId,s))).size).toBe(5);
 expect(cmd.content.items[0]).toMatchObject({operation:'translate-text',translation:v.translation,about:{kind:'theme',...v.theme}});
 expect(themeTranslationCapture(owner,{...v,translation:{...v.translation,text:'Changed'}}).content).not.toEqual(cmd.content);
 expect(themeRegistrationCommandSchema.parse({action:'submit-translation',...v})).toMatchObject({action:'submit-translation',translation:v.translation});
});
it('publishes complete translation schemas and the no-AI registration contract without requesting original-text changes',()=>{
 const guide=themeAuthoringGuide();expect(guide.schemas.submitTranslation).toBeDefined();expect(guide.translations.disclosure).toMatchObject({aiReview:false,externalAiTransmission:false});expect(guide.translations.attribution).toContain('anonymous');
 expect(guide.schemas.submitTranslation).toMatchObject({properties:{translation:{required:expect.arrayContaining(['expectedRevision'])}}});
});
it('exposes translation tools only through the existing compose handler and dispatches strict input',async()=>{
 const call=vi.fn().mockResolvedValue({state:'processing'}),handler=createMissionMcpHandler(vi.fn(),{call}),collection=createMissionMcpHandler(vi.fn());
 const tools=(await(await handler.fetch(rpc('tools/list',{}))).json()).result.tools;
 const old=(await(await collection.fetch(rpc('tools/list',{}))).json()).result.tools;
 const names=['read_theme_translation','submit_theme_translation','get_theme_translation_submission','cancel_theme_translation_submission'];
 expect(old.some((t:{name:string})=>names.includes(t.name))).toBe(false);
 expect(names.every(name=>tools.some((t:{name:string})=>t.name===name))).toBe(true);
 const v=input();await handler.fetch(rpc('tools/call',{name:'submit_theme_translation',arguments:v}));expect(call).toHaveBeenLastCalledWith(expect.objectContaining({action:'submit-translation',...v}));
 call.mockClear();await handler.fetch(rpc('tools/call',{name:'submit_theme_translation',arguments:{...v,origin:'https://untrusted.example'}}));expect(call).not.toHaveBeenCalled();
 call.mockResolvedValueOnce({ok:false,code:'TRANSLATION_CONFLICT',message:'Read the latest translation'});
 expect((await(await handler.fetch(rpc('tools/call',{name:'submit_theme_translation',arguments:v}))).json()).result.isError).toBe(true);
});
