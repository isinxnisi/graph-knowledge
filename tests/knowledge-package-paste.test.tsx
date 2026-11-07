// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../lib/client/use-member-identity',()=>({getMemberIdentitySnapshot:()=>({version:1,user:{id:'owner'}})}));
vi.mock('../lib/client/ui-locale',()=>({useUiLocale:()=>({locale:'ja'})}));
import {KnowledgePackagePaste} from '../components/KnowledgePackagePaste';
const fetcher=vi.fn(),pkg={format:'plunode-knowledge-package',schemaVersion:1,namespace:'chat',packageId:'fixture',revision:1,items:[{operation:'add-information',record:{assertion:'資料から確認した事実。'}}]};
beforeEach(()=>{fetcher.mockReset();vi.stubGlobal('fetch',fetcher);fetcher.mockImplementation(async()=>Response.json({items:[]}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows each pending item status even before a reason is available',async()=>{
 fetcher.mockImplementation(async()=>Response.json({items:[{requestId:'request',namespace:'chat',packageId:'waiting-package',revision:1,createdAt:'2026-11-07T06:00:00Z',receipt:{receiptId:'receipt',state:'processing',items:[{ordinal:1,state:'queued',reason:'',result:null}]}}]}));
 render(<KnowledgePackagePaste userId="owner" onDirty={()=>{}}/>);const details=screen.getByText('パッケージから登録').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'));
 expect(await screen.findByText('確認待ち')).toBeTruthy();expect(screen.queryByText('反映済み')).toBeNull();
});
it('keeps paste optional, previews the package, and retains the same request after an ambiguous response',async()=>{
 render(<KnowledgePackagePaste userId="owner" onDirty={()=>{}}/>);
 const details=screen.getByText('パッケージから登録').closest('details')!;expect(details.open).toBe(false);details.open=true;fireEvent(details,new Event('toggle'));
 fireEvent.change(screen.getByRole('textbox',{name:'取込パッケージ（JSON）'}),{target:{value:JSON.stringify(pkg)}});fireEvent.click(screen.getByRole('button',{name:'内容を確認'}));expect(screen.getByRole('listitem').textContent).toContain('資料から確認した事実。');
 fetcher.mockRejectedValueOnce(Error('offline'));fireEvent.click(screen.getByRole('button',{name:'この内容を受け付ける'}));await screen.findByText(/結果を確認できません/);
 const first=fetcher.mock.calls.find(([,o])=>o.method==='POST')![1].body;expect(screen.getByRole('textbox')).toHaveProperty('value',JSON.stringify(pkg));
 fetcher.mockImplementation(async(_url,o)=>Response.json(o.method==='POST'?{receipt:{receiptId:'receipt',state:'processing',items:[]},replayed:true}:{items:[]}));fireEvent.click(screen.getByRole('button',{name:'同じ内容を再送'}));await screen.findByRole('status');await waitFor(()=>expect(screen.getByRole('textbox')).toHaveProperty('value',''));expect(fetcher.mock.calls.filter(([,o])=>o.method==='POST')[1][1].body).toBe(first);
});
