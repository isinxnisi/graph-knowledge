// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {OperationsPage} from '../components/OperationsPage';
const mock=vi.hoisted(()=>({request:vi.fn(),summary:vi.fn(),identity:{status:'authenticated',user:{id:'00000000-0000-4000-8000-000000000001',name:'Operator',locale:'en',siteOperator:true},version:1,error:false}}));
vi.mock('../lib/client/member-api',async original=>({...await original(),memberRequest:mock.request}));
vi.mock('../lib/client/use-member-identity',()=>({useMemberSession:()=>mock.identity,refreshMemberIdentity:async()=>mock.identity.user,useOperationsSummary:()=>({status:'ready',data:{reports:1,recoveries:0,dueSoon:0,expiredReports:0,nextDeadline:null}}),refreshOperationsSummary:mock.summary,updateOperationsSummaryAfterAction:mock.summary}));
vi.mock('../lib/client/ui-locale',()=>({useUiLocale:()=>({locale:'en'})}));
vi.mock('../components/SiteHeader',()=>({default:()=>null}));
const report={id:'00000000-0000-4000-8000-000000000002',target_kind:'capsule',target_id:'00000000-0000-4000-8000-000000000003',community_id:'00000000-0000-4000-8000-000000000004',target_revision:5,report_revision:2,community_revision:19,community_status:'active',status:'open',category:'privacy',unexpired:true,created_at:'2026-10-29T00:00:00Z',expires_at:'2026-11-01T00:00:00Z'};
beforeEach(()=>{
 history.replaceState(null,'','/operations#reports');vi.stubGlobal('scrollTo',vi.fn());
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 mock.summary.mockReset();mock.request.mockReset().mockImplementation(async(_path:string,schema:z.ZodType,options?:{method?:string})=>schema.parse(options?.method==='POST'?{result:{blocked:true},replayed:false}:{items:[report],nextCursor:null,partial:false}));
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function select(){fireEvent.click(await screen.findByRole('button',{name:'Review →'}));}
it('Capsule通報では内容版停止を示し、明示確認まで処置を送信しない',async()=>{
 render(<OperationsPage dataset="demo"/>);await select();
 expect(screen.queryByRole('button',{name:'Suspend community'})).toBeNull();expect(screen.queryByRole('button',{name:'Hide post'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Block this Capsule version'}));
 const dialog=await screen.findByRole('dialog',{name:'Block this Capsule version'});
 expect(within(dialog).getByText(/across all shared links and community listings/)).toBeDefined();
 expect(mock.request.mock.calls.filter(c=>c[2]?.method==='POST')).toHaveLength(0);
 fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'Review confirmed privacy exposure'}});
 fireEvent.click(within(dialog).getByRole('button',{name:'Confirm action'}));
 await waitFor(()=>expect(mock.request.mock.calls.filter(c=>c[2]?.method==='POST')).toHaveLength(1));
 const write=mock.request.mock.calls.find(c=>c[2]?.method==='POST')!;
 expect(write[0]).toBe('/api/site-operations');expect(write[2].user).toBe(mock.identity.user.id);
 expect(write[2].body).toMatchObject({kind:'report',id:report.id,action:'block-capsule',expectedRevision:5,expectedReportRevision:2,reason:'Review confirmed privacy exposure'});
 expect(write[2].body.requestId).toMatch(/^[a-f0-9-]{36}$/);
});
it('確認対象の固定本文は文字列として表示し、HTMLを実行しない',async()=>{
 mock.request.mockImplementation(async(_path:string,schema:z.ZodType,options?:{method?:string})=>schema.parse(options?.method==='POST'?{result:{kind:'capsule',content:{title:'Fixed title',body:'{"note":"<img src=x onerror=alert(1)>"}'},detail:'Reported privacy concern'},replayed:false}:{items:[report],nextCursor:null,partial:false}));
 render(<OperationsPage dataset="demo"/>);await select();fireEvent.click(screen.getByRole('button',{name:'Review target'}));
 const dialog=await screen.findByRole('dialog',{name:'Review target'});
 fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'Review only reported version'}});
 fireEvent.click(within(dialog).getByRole('button',{name:'Confirm review'}));
 await within(dialog).findByText('{"note":"<img src=x onerror=alert(1)>"}');expect(dialog.querySelector('img')).toBeNull();
});
it('結果不明の版停止は同じrequestと期待版で再確認する',async()=>{
 let writes=0;mock.request.mockImplementation(async(_path:string,schema:z.ZodType,options?:{method?:string})=>{if(options?.method==='POST'&&++writes===1)throw new Error('lost response');return schema.parse(options?.method==='POST'?{result:{blocked:true},replayed:true}:{items:[report],nextCursor:null,partial:false});});
 render(<OperationsPage dataset="demo"/>);await select();fireEvent.click(screen.getByRole('button',{name:'Block this Capsule version'}));const dialog=await screen.findByRole('dialog',{name:'Block this Capsule version'});
 fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'Confirmed report'}});fireEvent.click(within(dialog).getByRole('button',{name:'Confirm action'}));
 fireEvent.click(await within(dialog).findByRole('button',{name:'Retry same request'}));await waitFor(()=>expect(writes).toBe(2));
 const calls=mock.request.mock.calls.filter(c=>c[2]?.method==='POST');expect(calls[1][2].body).toEqual(calls[0][2].body);
});
