// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {CommunityCapsules,CommunityCapsuleLinks} from '../components/CommunityPage';
import {CommunityRevalidation} from '../components/CommunityDialog';
import type {Community} from '../lib/domain/community';
import {MemberClientError} from '../lib/client/member-api';
const api=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../lib/client/member-api',async original=>({...await original(),memberRequest:api.request}));
vi.mock('../lib/client/ui-locale',()=>({useUiLocale:()=>({locale:'en'})}));
vi.mock('../components/CapsuleDialog',()=>({CapsuleReader:({capsule}:{capsule:{title:string;revision:number;note:string;document?:{nodes:{title:string}[]}}})=><section aria-label="Fixed Capsule"><h3>{capsule.title}</h3><p>version {capsule.revision}</p><p>{capsule.note}</p>{capsule.document?.nodes.map((node,i)=><p key={i}>{node.title}</p>)}</section>}));
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const community:Community={id:id(1),title:'Community',description:'Place',visibility:'public',status:'active',revision:7,role:'member',adminOffered:false,membershipGeneration:1};
const user={id:id(2),name:'Owner',locale:'en'};
const capsule={id:id(3),schemaVersion:1 as const,revision:2,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T01:00:00.000Z',content:{dataset:'demo' as const,title:'Confirmed content',note:'Only this fixed content',language:'ja' as const,entityIds:[id(4)],claimIds:[]}};
const listing={id:id(5),communityId:community.id,capsuleId:capsule.id,capsuleRevision:2,revision:3,audience:'cohort' as const,description:'Introduction',createdAt:'2026-10-29T01:00:00Z',updatedAt:'2026-10-29T01:00:00Z',title:'Confirmed content',entityCount:1,claimCount:0,canManage:true,threadId:id(6)};
const base='/'+community.id+'?tab=capsules';
const mutate=vi.fn(),onDirty=vi.fn(),onThread=vi.fn();
const props={community,user,dataset:'demo' as const,route:base,blocked:false,busy:false,mutate,onDirty,onThread};
beforeEach(()=>{
 vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.spyOn(window,'confirm').mockReturnValue(true);
 mutate.mockReset().mockResolvedValue({ok:true});onDirty.mockReset();onThread.mockReset();
 api.request.mockReset().mockImplementation(async(path:string,schema:z.ZodType)=>{
  const value=path==='/api/member/capsule-capabilities'?{documents:true,community:true}:path==='/api/member/capsules'?{capsules:[capsule]}:path==='/api/member/capsules/'+capsule.id?{capsule}:path==='/api/communities/capsules/'+listing.id?{listing,capsule}:{listings:[listing],nextCursor:null,partial:false};
  return schema.parse(value);
 });
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function preview(){
 fireEvent.click(await screen.findByRole('button',{name:'Publish your Capsule'}));
 const choice=await screen.findByRole('dialog',{name:'Choose a Capsule to publish'});
 fireEvent.click(within(choice).getByRole('radio'));
 fireEvent.click(within(choice).getByRole('button',{name:'Review publication'}));
 return await screen.findByRole('dialog',{name:'Confirm Capsule publication'});
}
it('一覧は掲載版へ遷移し、認可済み固定版と会話・一覧への戻りを接続する',async()=>{
 const {rerender}=render(<CommunityCapsules {...props}/>);
 const link=await screen.findByRole('link',{name:'Read Capsule'});
 expect(link.getAttribute('href')).toBe('#'+encodeURIComponent(base+'&listing='+listing.id));
 rerender(<CommunityCapsules {...props} route={base+'&listing='+listing.id}/>);
 const fixed=await screen.findByRole('region',{name:'Fixed Capsule'});
 expect(within(fixed).getByText('version 2')).toBeDefined();
 expect(screen.getAllByRole('link',{name:'← Back to Capsule list'})[0].getAttribute('href')).toBe('#'+encodeURIComponent(base));
 fireEvent.click(screen.getByRole('link',{name:'Open related conversation'}));expect(onThread).toHaveBeenCalledWith(listing.threadId);
 expect(api.request.mock.calls.find(c=>c[0]==='/api/communities/capsules/'+listing.id)?.[2].user).toBe(user.id);
});
it('内容全体と公開範囲を確認するまで送信せず、固定版・期待community版を掲載する',async()=>{
 render(<CommunityCapsules {...props}/>);const dialog=await preview();
 expect(within(dialog).getByRole('region',{name:'Fixed Capsule'})).toBeDefined();
 expect(mutate).not.toHaveBeenCalled();
 const publish=within(dialog).getByRole('button',{name:'Publish in this community'});expect((publish as HTMLButtonElement).disabled).toBe(false);
 expect(within(dialog).queryByRole('checkbox')).toBeNull();
 fireEvent.click(within(dialog).getByRole('radio',{name:'Everyone (public)'}));
 fireEvent.change(within(dialog).getByLabelText('Introduction in this community'),{target:{value:'Our discovery'}});

 fireEvent.click(publish);
 await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(1));
 expect(mutate).toHaveBeenCalledWith('/'+community.id+'/capsules',{expectedRevision:7,capsuleId:capsule.id,capsuleRevision:2,audience:'public',description:'Our discovery'},true);
 await screen.findByText('The confirmed version is published. Later edits are not published automatically.');
});
it('結果不明の掲載は入力と版を固定し、同じpayloadだけ再送する',async()=>{
 mutate.mockResolvedValueOnce({ok:false,unknown:true,code:'RESULT_UNKNOWN'}).mockResolvedValue({ok:true});
 const {rerender}=render(<CommunityCapsules {...props}/>);const dialog=await preview();

 fireEvent.click(within(dialog).getByRole('button',{name:'Publish in this community'}));
 const retry=await within(dialog).findByRole('button',{name:'Retry same request'});
 expect((within(dialog).getByLabelText('Introduction in this community') as HTMLTextAreaElement).disabled).toBe(true);
 rerender(<CommunityCapsules {...props} community={{...community,revision:8}}/>);
 fireEvent.click(retry);await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(2));
 expect(mutate.mock.calls[1]).toEqual(mutate.mock.calls[0]);
});
it('掲載更新は本人の最新版を再取得し、掲載の期待版だけを用いて明示更新する',async()=>{
 const current={...capsule,revision:4,content:{...capsule.content,title:'Latest private title'}};
 api.request.mockImplementation(async(path:string,schema:z.ZodType)=>schema.parse(path==='/api/member/capsules/'+capsule.id?{capsule:current}:path==='/api/communities/capsules/'+listing.id?{listing,capsule}:{listings:[listing],nextCursor:null,partial:false}));
 render(<CommunityCapsules {...props} route={base+'&listing='+listing.id}/>);
 fireEvent.click(await screen.findByLabelText('Publication actions'));
 fireEvent.click(await screen.findByRole('button',{name:'Update published version'}));
 const dialog=await screen.findByRole('dialog',{name:'Update published version'});
 expect(within(dialog).getAllByText('Latest private title').length).toBeGreaterThan(0);
 expect(mutate).not.toHaveBeenCalled();
 fireEvent.click(within(dialog).getByRole('button',{name:'Update to this version'}));
 await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(1));
 expect(mutate).toHaveBeenCalledWith('/capsules/'+listing.id+'/update',{expectedRevision:3,capsuleRevision:4,description:'Introduction',threadId:listing.threadId},true);
});
it('所有者でない閲覧者へ掲載管理を表示せず、異なるdatasetやlistingの内容を表示しない',async()=>{
 api.request.mockImplementation(async(_path:string,schema:z.ZodType)=>schema.parse({listing:{...listing,canManage:false},capsule:{...capsule,content:{...capsule.content,dataset:'public-kg'}}}));
 render(<CommunityCapsules {...props} route={base+'&listing='+listing.id}/>);
 await screen.findByRole('alert');expect(screen.queryByRole('region',{name:'Fixed Capsule'})).toBeNull();expect(screen.queryByRole('button',{name:'Withdraw listing'})).toBeNull();
});
it('失効と非表示で旧読取を破棄し、再認可失敗時は本文を返さない',async()=>{
 let finish!:(value:unknown)=>void;
 api.request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=(blocked:boolean)=><CommunityRevalidation.Provider value={blocked}><CommunityCapsules {...props} blocked={blocked} route={base+'&listing='+listing.id}/></CommunityRevalidation.Provider>;
 const {rerender}=render(view(false));await waitFor(()=>expect(api.request).toHaveBeenCalledTimes(1));
 rerender(view(true));await act(async()=>finish({listing,capsule}));expect(screen.queryByRole('region',{name:'Fixed Capsule'})).toBeNull();
 api.request.mockRejectedValueOnce(new MemberClientError(404,'NOT_FOUND'));rerender(view(false));await screen.findByRole('alert');expect(screen.queryByRole('region',{name:'Fixed Capsule'})).toBeNull();
});
it('掲載撤去は確認して送信し、失敗を成功表示しない',async()=>{
 mutate.mockResolvedValue({ok:false,unknown:false,code:'COMMUNITY_CHANGED'});
 render(<CommunityCapsules {...props} route={base+'&listing='+listing.id}/>);
 fireEvent.click(await screen.findByLabelText('Publication actions'));
 fireEvent.click(await screen.findByRole('button',{name:'Withdraw listing'}));
 const dialog=await screen.findByRole('dialog',{name:'Withdraw Capsule listing'});expect(mutate).not.toHaveBeenCalled();
 fireEvent.click(within(dialog).getByRole('button',{name:'Confirm withdrawal'}));await within(dialog).findByRole('alert');
 expect(mutate).toHaveBeenCalledWith('/capsules/'+listing.id+'/withdraw',{expectedRevision:3},true);
 expect(screen.queryByText('Listing withdrawn. The Capsule and conversation are preserved.')).toBeNull();
});

it('documentを除いた一覧から完全な内容を再取得し、その版だけをプレビュー・掲載する',async()=>{
 const document={schemaVersion:1,nodes:[{key:id(20),title:'Local unpublished discovery',description:'Local context',badge:'Hypothesis',origin:{kind:'local'}}],relations:[],texts:[],evidence:[],unresolvedClaimIds:[],layout:{positions:{},pan:{x:0,y:0},zoom:1}};
 const full={...capsule,schemaVersion:2,revision:6,content:{...capsule.content,entityIds:[],document}};
 const {document:omitted,...summaryContent}=full.content;expect(omitted).toBe(document);
 api.request.mockImplementation(async(path:string,schema:z.ZodType)=>schema.parse(path==='/api/member/capsule-capabilities'?{documents:true,community:true}:path==='/api/member/capsules'?{capsules:[{...full,content:summaryContent,hasDocument:true}]}:path==='/api/member/capsules/'+capsule.id?{capsule:full}:{listings:[],nextCursor:null,partial:false}));
 render(<CommunityCapsules {...props}/>);const dialog=await preview();
 expect(within(dialog).getByText('Local unpublished discovery')).toBeDefined();
 expect(api.request.mock.calls.some(c=>c[0]==='/api/member/capsules/'+capsule.id)).toBe(true);
 fireEvent.click(within(dialog).getByRole('button',{name:'Publish in this community'}));
 await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(1));expect(mutate.mock.calls[0][1].capsuleRevision).toBe(6);
});
it('migrationのない環境では掲載成功や選択画面を表示しない',async()=>{
 api.request.mockImplementation(async(path:string,schema:z.ZodType)=>schema.parse(path==='/api/member/capsule-capabilities'?{documents:true,community:false}:{listings:[],nextCursor:null,partial:false}));
 render(<CommunityCapsules {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Publish your Capsule'}));
 await screen.findByRole('alert');expect(screen.queryByRole('dialog')).toBeNull();expect(mutate).not.toHaveBeenCalled();
});
it('会話を残して関連Capsuleを別タブで開き、固定版の掲載URLを維持する',()=>{
 render(<CommunityCapsuleLinks listings={[listing]}/>);
 const link=screen.getByRole('link',{name:listing.title+' · opens in a new tab'});expect(link.getAttribute('href')).toBe('#'+encodeURIComponent(base+'&listing='+listing.id));expect(link.getAttribute('target')).toBe('_blank');expect(link.getAttribute('rel')).toContain('noopener');expect(screen.getByRole('link',{name:'All Capsules'}).getAttribute('target')).toBe('_blank');expect(screen.getByText(/Content version 2/)).toBeDefined();
});
it('アーカイブ中も所有者は掲載を撤去でき、新版更新は停止する',async()=>{
 render(<CommunityCapsules {...props} community={{...community,status:'archived'}} route={base+'&listing='+listing.id}/>);
 fireEvent.click(await screen.findByLabelText('Publication actions'));
 const withdraw=await screen.findByRole('button',{name:'Withdraw listing'});expect((withdraw as HTMLButtonElement).disabled).toBe(false);expect((screen.getByRole('button',{name:'Update published version'}) as HTMLButtonElement).disabled).toBe(true);
});
it('掲載更新でcursorが失効したら最初の一覧から再開できる',async()=>{
 api.request.mockImplementation(async(path:string,schema:z.ZodType)=>{
  if(path.includes('cursor='))throw new MemberClientError(409,'PAGE_CHANGED');
  return schema.parse({listings:[listing],nextCursor:'next-page',partial:true});
 });
 render(<CommunityCapsules {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Next page'}));
 fireEvent.click(await screen.findByRole('button',{name:'Restart from the first page'}));
 await screen.findByRole('link',{name:'Read Capsule'});expect(api.request.mock.calls.at(-1)![0]).toBe('/api/communities/'+community.id+'/capsules');
});

it('公開先に合う会話だけを選べ、公開範囲変更で限定会話を誤って紐づけない',async()=>{
 render(<CommunityCapsules {...props} threads={[{id:id(60),title:'Private discussion',audience:'cohort'},{id:id(61),title:'Public discussion',audience:'public'}]}/>);
 const dialog=await preview(),select=within(dialog).getByLabelText('Related conversation (optional)');
 fireEvent.change(select,{target:{value:id(60)}});expect((select as HTMLSelectElement).value).toBe(id(60));
 fireEvent.click(within(dialog).getByRole('radio',{name:'Everyone (public)'}));
 expect((select as HTMLSelectElement).value).toBe('');expect(within(select).queryByText(/Private discussion/)).toBeNull();
 fireEvent.click(within(dialog).getByRole('button',{name:'Publish in this community'}));await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(1));expect(mutate.mock.calls[0][1].threadId).toBeUndefined();
});
