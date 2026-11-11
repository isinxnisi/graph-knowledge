// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({request:vi.fn(),session:{status:'authenticated',user:{id:'fixture'}}}));
vi.mock('../lib/client/use-member-identity',()=>({useMemberSession:()=>mocks.session}));
vi.mock('../lib/client/member-api',async original=>({...await original<object>(),memberRequest:mocks.request}));
import Generate from '../components/KnowledgeTranslationGenerate';
const target={kind:'entity' as const,id:'example',revision:1,field:'name' as const};
const state=(v:object={})=>({generation:{id:'a'.repeat(64),state:'none',reason:'',text:null,nextAttemptAt:null,attempts:0,workerAvailable:true,...v}});
beforeEach(()=>{mocks.request.mockReset();mocks.session.status='authenticated';mocks.request.mockResolvedValue(state());});
afterEach(cleanup);
it('keeps generation tools closed until requested and can close them again',async()=>{
 render(<Generate target={target} language="en" en={false}/>);
 expect(screen.queryByRole('checkbox')).toBeNull();
 expect(mocks.request).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'自動で下書き'}));
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledTimes(1));
 expect(screen.getByRole('checkbox')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'下書きを閉じる'}));
 expect(screen.queryByRole('checkbox')).toBeNull();
 expect(mocks.request.mock.calls.every(call=>call[2].body.action==='status')).toBe(true);
});
it('does not generate on opening and requires explicit consent',async()=>{
 render(<Generate target={target} language="en" en={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'自動で下書き'}));
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledTimes(1));
 expect(mocks.request.mock.calls[0][2].body.action).toBe('status');expect((screen.getByText('訳文を自動で下書き') as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByText('訳文を自動で下書き'));
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledTimes(2));expect(mocks.request.mock.calls[1][2].body).toMatchObject({action:'request',target,language:'en',profileId:'google-gemini-free-translation-context-v2'});
});
it('shows a cached editable draft and carries its exact generation ID',async()=>{
 mocks.request.mockResolvedValue(state({state:'ready',text:'Translated name'}));render(<Generate target={target} language="en" en={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'自動で下書き'}));
 expect(await screen.findByText('Translated name')).toBeTruthy();const link=screen.getByText('この訳文を確認・編集する',{exact:false});expect(link.getAttribute('href')).toContain('generation='+'a'.repeat(64));expect(screen.queryByText('訳文を自動で下書き')).toBeNull();expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('keeps quota waiting and cancellation next to the request',async()=>{
 mocks.request.mockResolvedValueOnce(state({state:'quota',reason:'翻訳用の利用枠を待っています。'})).mockResolvedValueOnce(state({state:'cancelled',reason:'依頼を取り消しました。'}));
 render(<Generate target={target} language="en" en={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'自動で下書き'}));expect(await screen.findByText('翻訳用の利用枠を待っています。')).toBeTruthy();fireEvent.click(screen.getByText('依頼を取り消す'));expect(await screen.findByText('依頼を取り消しました。')).toBeTruthy();expect(mocks.request.mock.calls[1][2].body.action).toBe('cancel');expect(screen.getByText('訳文を自動で下書き')).toBeTruthy();
});
it('does not request generation or private status for a guest',()=>{
 mocks.session.status='guest';render(<Generate target={target} language="en" en={false}/>);
 fireEvent.click(screen.getByRole('button',{name:'自動で下書き'}));expect(screen.getByText('ログインすると自動翻訳を依頼できます。')).toBeTruthy();expect(mocks.request).not.toHaveBeenCalled();
});
