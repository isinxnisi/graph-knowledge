// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({identity:{version:1,user:{id:'owner'}}}));
vi.mock('../lib/client/use-member-identity',()=>({getMemberIdentitySnapshot:()=>state.identity}));
vi.mock('../lib/client/ui-locale',()=>({useUiLocale:()=>({locale:'ja'})}));
import {KnowledgeCollection} from '../components/KnowledgeCollection';
const fetcher=vi.fn(),page={stage:'capture',items:[],nextBefore:null,workerConnected:false};
beforeEach(()=>{fetcher.mockReset();vi.stubGlobal('fetch',fetcher);state.identity={version:1,user:{id:'owner'}};fetcher.mockImplementation(async(url)=>Response.json(String(url).includes('collection-reading')?{provider:'Google Gemini',workerConnected:false,jobs:[]}:page));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function fill(){fireEvent.click(screen.getByRole('button',{name:'収集を依頼'}));fireEvent.change(screen.getByRole('textbox',{name:'依頼の名前'}),{target:{value:'Webb capture'}});fireEvent.change(screen.getByRole('textbox',{name:'調べる内容・範囲'}),{target:{value:'Only launch facts'}});fireEvent.change(screen.getByRole('textbox',{name:/公開資料のURL/}),{target:{value:'https://science.nasa.gov/mission/webb/launch/'}});}
it('keeps the initial screen compact, explains capture and reading scope and the PC wait',async()=>{render(<KnowledgeCollection userId="owner" authorized/>);await screen.findByText(/PC側の処理待ち/);expect(screen.queryByRole('textbox')).toBeNull();expect(screen.getByText(/取得後に対象と範囲を指定/)).toBeTruthy();await fill();expect(screen.getByRole('button',{name:'資料取得を開始'})).toHaveProperty('disabled',false);});
it('retries the same immutable request after ambiguous delivery and retains the draft',async()=>{render(<KnowledgeCollection userId="owner" authorized/>);await screen.findByText(/PC側の処理待ち/);await fill();fetcher.mockRejectedValueOnce(Error('offline'));fireEvent.click(screen.getByRole('button',{name:'資料取得を開始'}));await screen.findByText(/結果を確認できません/);const sent=fetcher.mock.calls.find(([,o])=>o.method==='POST')![1].body;expect((screen.getByRole('textbox',{name:'依頼の名前'}) as HTMLInputElement).value).toBe('Webb capture');fetcher.mockImplementation(async(_url,o)=>Response.json(o.method==='POST'?{result:{id:'test'},replayed:true}:page));fireEvent.click(screen.getByRole('button',{name:'同じ依頼を再送'}));await waitFor(()=>expect(screen.queryByRole('textbox')).toBeNull());expect(fetcher.mock.calls.filter(([,o])=>o.method==='POST')[1][1].body).toBe(sent);});
it('preserves an unsent draft across authorization revalidation and rejects old identity responses',async()=>{const view=render(<KnowledgeCollection userId="owner" authorized/>);await screen.findByText(/PC側の処理待ち/);await fill();view.rerender(<KnowledgeCollection userId="owner" authorized={false}/>);expect(screen.queryByRole('textbox')).toBeNull();view.rerender(<KnowledgeCollection userId="owner" authorized/>);await screen.findByRole('textbox',{name:'依頼の名前'});expect((screen.getByRole('textbox',{name:'依頼の名前'}) as HTMLInputElement).value).toBe('Webb capture');let done!:(r:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise(r=>{done=r;}));fireEvent.click(screen.getByRole('button',{name:'資料取得を開始'}));view.unmount();await act(async()=>done(Response.json({result:{id:'test'},replayed:false})));});

it('retains the reading form across revalidation and requires an explicit target and publication choice',async()=>{
 const captured={...page,items:[{id:'capture',title:'Webb source',scope:'Webbの副鏡を調べる',state:'active',createdAt:'2026-11-04T00:00:00Z',items:[{id:'source',url:'https://example.org/source',state:'captured',attempts:1,reason:'',fetchedAt:null,bodySha256:null,textSha256:null,bytes:null}]}]};
 fetcher.mockImplementation(async(url)=>Response.json(String(url).includes('/api/knowledge/public')?{themes:[{id:'theme',revision:1,title:'Webbの年表'}]}:String(url).includes('collection-reading')?{provider:'Google Gemini',workerConnected:true,jobs:[]}:captured));
 const view=render(<KnowledgeCollection userId="owner" authorized/>);await screen.findByRole('button',{name:'取得済み資料から依頼'});fireEvent.click(screen.getByRole('button',{name:'取得済み資料から依頼'}));expect(screen.getByRole('button',{name:'読解して登録を開始'})).toHaveProperty('disabled',true);
 fireEvent.click((await screen.findByText('Webbの年表')).closest('button')!);fireEvent.change(screen.getByRole('textbox',{name:'この資料から登録する内容・範囲'}),{target:{value:'副鏡の直径を調べて登録する'}});fireEvent.click(screen.getByRole('checkbox',{name:/指定した資料・対象・範囲/}));expect(screen.getByRole('button',{name:'読解して登録を開始'})).toHaveProperty('disabled',false);
 view.rerender(<KnowledgeCollection userId="owner" authorized={false}/>);expect(screen.queryByRole('textbox',{name:'この資料から登録する内容・範囲'})).toBeNull();view.rerender(<KnowledgeCollection userId="owner" authorized/>);expect(screen.getByRole('textbox',{name:'この資料から登録する内容・範囲'})).toHaveProperty('value','副鏡の直径を調べて登録する');expect(screen.getByRole('checkbox',{name:/指定した資料・対象・範囲/})).toHaveProperty('checked',true);
});

it('shows returned candidates and published results without mistaking them for a status fetch failure',async()=>{
 const reading={provider:'Google Gemini',workerConnected:true,jobs:[{
  id:'read-job',capture_job_id:'capture',scope:'共同で担った役割',target:{kind:'theme',id:'theme',revision:1},label:'Webbの協力',state:'active',createdAt:'2026-11-04T00:00:00Z',
  tasks:[{id:'read',purpose:'read',state:'done',reason:'',attempts:1,candidate:null,next_attempt:'2026-11-04T00:00:00Z'},
   {id:'check',record_id:'registered',purpose:'check',state:'done',reason:'登録しました。',attempts:1,candidate:{assertion:'AはBを共同で準備した。'},next_attempt:'2026-11-04T00:00:00Z'},
   {id:'other',record_id:'different-record',purpose:'check',state:'queued',reason:'別資料の確認を待っています。',attempts:0,candidate:{assertion:'AはBを共同で準備した。'},next_attempt:'2026-11-04T00:00:00Z'}],
  decisions:[{id:'registered',state:'applied',reason:'',assertion:'AはBを共同で準備した。',indexed:true}]
 }]};
 fetcher.mockImplementation(async url=>Response.json(String(url).includes('collection-reading')?reading:page));
 render(<KnowledgeCollection userId="owner" authorized/>);
 await screen.findByText('読解 1/1資料区画 · 登録 1件 · 要確認 0件');
 expect(screen.queryByText(/登録処理の状態を取得できません/)).toBeNull();
 fireEvent.click(screen.getByText('項目・結果を見る'));
 expect(screen.getByRole('link',{name:'AはBを共同で準備した。'}).getAttribute('href')).toBe('/?krecord=registered');
 expect(screen.getAllByText(/公開しました。/)).toHaveLength(1);
 expect(screen.getAllByText(/別資料の確認を待っています/).length).toBeGreaterThan(0);
});
