import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {themeRegistrationInputSchema,themeUpdateInputSchema} from '../lib/domain/knowledge-theme-registration';
import {editorialFileURL,downloadEditorialFile} from '../lib/server/editorial-file-download';
import {createMissionMcpHandler} from '../lib/server/knowledge-mission-mcp';
import {PROTOCOL_VERSION_META_KEY,CLIENT_INFO_META_KEY,CLIENT_CAPABILITIES_META_KEY} from '@modelcontextprotocol/server';
const row={locale:'ja',hook:'どう生まれた？',lead:'根拠からたどる。',imageId:'a'.repeat(64),records:[{target:{id:'item:new',revision:1},shortTitle:'誕生'}]};
const rpc=(method:string,params:Record<string,unknown>)=>new Request('https://example.org/api/knowledge-collection/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':method,...(typeof params.name==='string'?{'mcp-name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{[PROTOCOL_VERSION_META_KEY]:'2026-07-28',[CLIENT_INFO_META_KEY]:{name:'editorial-test',version:'1'},[CLIENT_CAPABILITIES_META_KEY]:{}}}})});
it('accepts a complete generic presentation, keeps languages distinct and rejects untyped asset URLs',()=>{
 const create={requestId:randomUUID(),title:'Any theme',recordPins:[{id:'r',revision:1}],presentation:[row]};
 expect(themeRegistrationInputSchema.parse(create).presentation?.[0].imageId).toBe(row.imageId);
 expect(themeRegistrationInputSchema.safeParse({...create,presentation:[row,row]}).success).toBe(false);
 expect(themeRegistrationInputSchema.safeParse({...create,presentation:[{...row,imageUrl:'https://evil.invalid/asset'}]}).success).toBe(false);
 const edit={requestId:randomUUID(),target:{id:'any-theme',revision:2},changes:{presentation:[]},reason:'Remove only the new edition presentation'};
 expect(themeUpdateInputSchema.parse(edit).changes.presentation).toEqual([]);
 expect(themeUpdateInputSchema.parse({...edit,changes:{title:'New title'}}).changes).not.toHaveProperty('presentation');
});
it('publishes the complete four-property file contract and forwards a host-authorized attachment without base64',async()=>{
 const call=vi.fn().mockResolvedValue({imageId:'a'.repeat(64)}),handler=createMissionMcpHandler(vi.fn(),{call});
 const listed=(await(await handler.fetch(rpc('tools/list',{}))).json()).result.tools;
 const tool=listed.find((v:{name:string})=>v.name==='upload_editorial_image');expect(tool._meta['openai/fileParams']).toEqual(['file']);
 expect(Object.keys(tool.inputSchema.properties.file.properties)).toEqual(['download_url','file_id','mime_type','file_name']);expect(tool.inputSchema.properties.file.required).toEqual(['download_url','file_id']);
 const value={requestId:randomUUID(),purpose:'theme-illustration',file:{file_id:'file-fixture',download_url:'https://files.oaiusercontent.com/temporary'},provenance:{id:'operator-owned',kind:'original',credit:'',terms:'Operator-created',creditDisplay:'internal'},alt:{ja:'テーマの挿絵',en:'Theme illustration'}};
 await handler.fetch(rpc('tools/call',{name:'upload_editorial_image',arguments:value}));expect(call).toHaveBeenCalledWith(expect.objectContaining({...value,action:'upload-editorial-image'}));
});
it.each(['http://files.oaiusercontent.com/a','https://files.oaiusercontent.com.evil.invalid/a','https://127.0.0.1/a','https://files.oaiusercontent.com:8443/a','https://user@files.oaiusercontent.com/a','https://m.media-amazon.com/a'])('rejects arbitrary/private/Amazon file sources before network access: %s',async url=>{
 expect(()=>editorialFileURL(url)).toThrow();await expect(downloadEditorialFile(url)).rejects.toHaveProperty('code','FILE_REFERENCE_INVALID');
});

it('keeps unrelated reading content when removing a member without making metadata edits mandatory',async()=>{
 const {retainedThemeEditorial,editorialReferenceError}=await import('../lib/server/theme-editorial');
 const {resolvedThemeEditorialSchema}=await import('../lib/domain/theme-editorial');
 const reading=resolvedThemeEditorialSchema.parse([{locale:'ja',hook:'入口',lead:'紹介',records:[{target:{id:'kept',revision:1},shortTitle:'残す',explanations:[{record:{id:'removed-note',revision:1},role:'background'}]},{target:{id:'removed',revision:1},shortTitle:'外す'}],entityNotes:[{target:{id:'person',revision:1},text:'人物の説明',supportingRecords:[{id:'kept',revision:1},{id:'removed',revision:1}]}]}]);
 const snapshot={records:[{id:'kept',revision:1,content:{kind:'relation',subjectId:'person'}}],entities:[{id:'person',revision:1}]} as unknown as import('../lib/domain/knowledge-foundation').KnowledgeSnapshot;
 const retained=retainedThemeEditorial(reading,snapshot)!;
 expect(retained[0].records.map(r=>r.target.id)).toEqual(['kept']);expect(retained[0].records[0].explanations).toEqual([]);expect(retained[0].entityNotes[0].supportingRecords).toEqual([{id:'kept',revision:1}]);expect(editorialReferenceError(retained,snapshot)).toBeNull();expect(reading[0].records).toHaveLength(2);
});
