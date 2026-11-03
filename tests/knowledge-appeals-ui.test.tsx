// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({identity:{status:'authenticated',version:1,user:{id:'00000000-0000-4000-8000-000000000001'}}}));
vi.mock('../lib/client/use-member-identity',()=>({getMemberIdentitySnapshot:()=>state.identity,refreshOperationsSummary:vi.fn()}));
vi.mock('../lib/client/ui-locale',()=>({useUiLocale:()=>({locale:'ja'})}));
import KnowledgeAppeal from '../components/KnowledgeAppeal';
import {KnowledgeOperations} from '../components/KnowledgeOperations';
const fetcher=vi.fn(),id='10000000-0000-4000-8000-000000000001',user=state.identity.user.id;
const appeal={id,revision:1,status:'open' as const,pending:false,detail:'Check the original passage',createdAt:'2026-11-04T01:00:00Z',replies:[]};
beforeEach(()=>{fetcher.mockReset();vi.stubGlobal('fetch',fetcher);state.identity={status:'authenticated',version:1,user:{id:user}};});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
function member(onChange=vi.fn()){return render(<KnowledgeAppeal submissionId={id} revision={4} itemKey="selected" userId={user} published={false} onChange={onChange}/>);}
async function fill(){fireEvent.click(screen.getByRole('button',{name:'この結果について運営に相談'}));fireEvent.change(screen.getByRole('textbox',{name:'確認してほしいこと'}),{target:{value:'Check this cited passage'}});fireEvent.click(screen.getByRole('checkbox'));}
it('keeps the request compact until opened and requires explicit sharing',async()=>{
 const change=vi.fn();member(change);expect(screen.queryByRole('textbox')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'この結果について運営に相談'}));fireEvent.change(screen.getByRole('textbox'),{target:{value:'Check this passage'}});expect(screen.getByRole('button',{name:'相談を送る'})).toHaveProperty('disabled',true);fireEvent.click(screen.getByRole('checkbox'));
 fetcher.mockResolvedValueOnce(Response.json({appeal,replayed:false}));fireEvent.click(screen.getByRole('button',{name:'相談を送る'}));await waitFor(()=>expect(change).toHaveBeenCalledOnce());expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({action:'appeal',submissionId:id,revision:4,itemKey:'selected',shareWithOperators:true});
});
it('unknown delivery retries the identical request and preserves the entered message',async()=>{
 member();await fill();fetcher.mockRejectedValueOnce(Error('offline'));fireEvent.click(screen.getByRole('button',{name:'相談を送る'}));await screen.findByText(/送信結果が不明/);expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Check this cited passage');const first=fetcher.mock.calls[0][1].body;
 fetcher.mockResolvedValueOnce(Response.json({appeal,replayed:true}));fireEvent.click(screen.getByRole('button',{name:'同じ内容で再送'}));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(fetcher.mock.calls[1][1].body).toBe(first);
});
it('does not notify a new view after its requesting component unmounts',async()=>{
 const change=vi.fn(),view=member(change);await fill();let finish!:(r:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));fireEvent.click(screen.getByRole('button',{name:'相談を送る'}));view.unmount();await act(async()=>{finish(Response.json({appeal,replayed:false}));});expect(change).not.toHaveBeenCalled();
});
it('withdraws only the open case without cancelling the submitted review',async()=>{
 const change=vi.fn();render(<KnowledgeAppeal submissionId={id} revision={4} itemKey="selected" userId={user} published={false} appeal={appeal} onChange={change}/>);fetcher.mockResolvedValueOnce(Response.json({appeal:{...appeal,status:'withdrawn',revision:2},replayed:false}));fireEvent.click(screen.getByRole('button',{name:'相談を取り消す'}));await waitFor(()=>expect(change).toHaveBeenCalledOnce());expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({action:'withdraw',id,expectedRevision:1});
});
const caseData={case:appeal,snapshot:{item:{record:{assertion:'Fixture fact',evidence:[{locator:'Body',excerpt:'Original passage'}]}},entities:[{content:{name:'Subject'}}],sources:[{content:{title:'Source',url:'https://example.org/source'}}],review:{state:'declined',reason:'Original result'},submittedAt:appeal.createdAt},current:{submittedRevision:4,state:'declined',current:true,publication:null},moderation:null,history:[]};
function operatorFetch(){fetcher.mockImplementation(async(_path:string,init?:RequestInit)=>{
 if(init?.method==='POST')return Response.json({result:caseData,replayed:false});
 return Response.json({items:[{id,revision:1,status:'open',created_at:appeal.createdAt,job_state:'declined',submitted_revision:4}],nextBefore:null});
});}
it('operators inspect explicitly and see that content confirmation still requires source checks',async()=>{
 operatorFetch();render(<KnowledgeOperations userId={user} authorized/>);await screen.findByRole('button',{name:'内容を確認（監査に記録）'});expect(screen.queryByText('Fixture fact')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'内容を確認（監査に記録）'}));await screen.findByText('Fixture fact');expect(screen.getByText(/受付版 4/)).toBeTruthy();fireEvent.change(screen.getByRole('combobox',{name:'対応'}),{target:{value:'confirm-content'}});expect(screen.getByText(/原資料・対象の現在資格・版の確認/)).toBeTruthy();
});
it('rechecking operator authorization hides content and retains a same-case reply',async()=>{
 operatorFetch();const view=render(<KnowledgeOperations userId={user} authorized/>);fireEvent.click(await screen.findByRole('button',{name:'内容を確認（監査に記録）'}));await screen.findByText('Fixture fact');fireEvent.change(screen.getByRole('textbox',{name:'投稿者への回答・判断理由'}),{target:{value:'My unfinished reply'}});view.rerender(<KnowledgeOperations userId={user} authorized={false}/>);expect(screen.queryByText('Fixture fact')).toBeNull();view.rerender(<KnowledgeOperations userId={user} authorized/>);fireEvent.click(await screen.findByRole('button',{name:'内容を確認（監査に記録）'}));await screen.findByText('Fixture fact');expect((screen.getByRole('textbox',{name:'投稿者への回答・判断理由'}) as HTMLTextAreaElement).value).toBe('My unfinished reply');
});
