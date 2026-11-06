// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({identity:{version:1,user:{id:'owner'}}}));
vi.mock('../lib/client/use-member-identity',()=>({getMemberIdentitySnapshot:()=>state.identity}));
vi.mock('../lib/client/ui-locale',()=>({useUiLocale:()=>({locale:'ja'})}));
import {KnowledgeMissions} from '../components/KnowledgeMissions';
const page={items:[],themes:[{id:'theme',label:'Webbの年表'}],entities:[{id:'webb',label:'Webb'}],workerConnected:false,workerLastSeen:null},fetcher=vi.fn();
beforeEach(()=>{fetcher.mockReset();vi.stubGlobal('fetch',fetcher);fetcher.mockImplementation(async()=>Response.json(page));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function fill(){fireEvent.click(screen.getByRole('button',{name:'計画を追加'}));fireEvent.change(screen.getByRole('textbox',{name:'計画の名前'}),{target:{value:'Webbの装置'}});fireEvent.change(screen.getByRole('combobox',{name:'追加先のテーマ'}),{target:{value:'theme'}});fireEvent.change(screen.getByRole('textbox',{name:'何を調べますか'}),{target:{value:'Webbの観測装置について資料を調べる'}});fireEvent.change(screen.getByRole('textbox',{name:/資料のサイト/}),{target:{value:'www.esa.int'}});}
it('keeps settings closed initially and distinguishes a saved plan from a connected schedule',async()=>{
 render(<KnowledgeMissions userId="owner" authorized onDirty={()=>{}}/>);await screen.findByText(/定期実行は未接続/);expect(screen.queryByRole('textbox')).toBeNull();await fill();expect(screen.getByRole('button',{name:'この計画で収集'})).toBeTruthy();
});
it('retains the form on a lost save response and retries exactly the same request',async()=>{
 render(<KnowledgeMissions userId="owner" authorized onDirty={()=>{}}/>);await screen.findByText(/定期実行は未接続/);await fill();fetcher.mockRejectedValueOnce(Error('offline'));
 fireEvent.click(screen.getByRole('button',{name:'この計画で収集'}));await screen.findByText(/保存結果を確認できません/);const first=fetcher.mock.calls.find(([,o])=>o.method==='POST')![1].body;
 expect(screen.getByRole('textbox',{name:'計画の名前'})).toHaveProperty('value','Webbの装置');fetcher.mockImplementation(async(_url,o)=>Response.json(o.method==='POST'?{result:{id:'plan',revision:1},replayed:true}:page));fireEvent.click(screen.getByRole('button',{name:'同じ操作を再送'}));
 await waitFor(()=>expect(screen.queryByRole('textbox')).toBeNull());expect(fetcher.mock.calls.filter(([,o])=>o.method==='POST')[1][1].body).toBe(first);
});
