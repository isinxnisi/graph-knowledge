// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CommunitySafetyActions} from '../components/CommunitySafety';
import {CommunityRevalidation} from '../components/CommunityDialog';
const t=(_:string,en:string)=>en;
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});afterEach(cleanup);
it('既知の失敗では入力を残し、明示した再試行だけ最新revisionを使う',async()=>{
 const mutate=vi.fn().mockResolvedValueOnce({ok:false,code:'COMMUNITY_CHANGED',unknown:false}).mockResolvedValue({ok:true});
 const view=(revision:number)=><CommunitySafetyActions kind="post" id="p" revision={revision} t={t} mutate={mutate} busy={false} reportable/>;
 const {rerender}=render(view(1));fireEvent.click(screen.getByRole('button',{name:/Report\s*· post/}));fireEvent.change(screen.getByLabelText('Reason for reporting'),{target:{value:'draft'}});fireEvent.submit(screen.getByLabelText('Reason for reporting').closest('form')!);
 await screen.findByRole('alert');expect((screen.getByLabelText('Reason for reporting') as HTMLTextAreaElement).value).toBe('draft');rerender(view(2));expect(mutate).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole('button',{name:'Retry with current target version'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(mutate.mock.calls[1][1].expectedRevision).toBe(2);
});
it('結果不明ではrevision更新後も最初のpayloadで再確認する',async()=>{
 const mutate=vi.fn().mockResolvedValueOnce({ok:false,code:'RESULT_UNKNOWN',unknown:true}).mockResolvedValue({ok:true});const view=(revision:number)=><CommunitySafetyActions kind="post" id="p" revision={revision} t={t} mutate={mutate} busy={false} reportable/>;
 const {rerender}=render(view(1));fireEvent.click(screen.getByRole('button',{name:/Report\s*· post/}));fireEvent.change(screen.getByLabelText('Reason for reporting'),{target:{value:'draft'}});fireEvent.submit(screen.getByLabelText('Reason for reporting').closest('form')!);await screen.findByRole('alert');rerender(view(2));fireEvent.click(screen.getByRole('button',{name:'Retry same submission'}));await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(2));expect(mutate.mock.calls[1]).toEqual(mutate.mock.calls[0]);
});
it('キャンセルで即破棄せず、再認可中はダイアログも閉じて同じ入力を戻す',async()=>{
 const view=(blocked:boolean)=><CommunityRevalidation.Provider value={blocked}><CommunitySafetyActions kind="post" id="p" revision={1} t={t} mutate={vi.fn()} busy={false} reportable/></CommunityRevalidation.Provider>;
 const {rerender}=render(view(false));fireEvent.click(screen.getByRole('button',{name:/Report\s*· post/}));const input=screen.getByLabelText('Reason for reporting');fireEvent.change(input,{target:{value:'private draft'}});fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.getByRole('button',{name:'Keep editing'})).toBeDefined();fireEvent.click(screen.getByRole('button',{name:'Keep editing'}));act(()=>rerender(view(true)));expect(screen.queryByRole('dialog')).toBeNull();act(()=>rerender(view(false)));expect(screen.getByLabelText('Reason for reporting')).toBe(input);fireEvent.click(screen.getByRole('button',{name:'Cancel'}));fireEvent.click(screen.getByRole('button',{name:'Discard & close'}));expect(screen.queryByRole('dialog')).toBeNull();
});
it('Capsule掲載の通報は掲載IDと読んだ掲載版を既存受付へ送る',async()=>{
 const mutate=vi.fn().mockResolvedValue({ok:true});
 render(<CommunitySafetyActions kind="capsule" id="listing-id" revision={4} t={t} mutate={mutate} busy={false} reportable targetLabel="Shared content"/>);
 fireEvent.click(screen.getByRole('button',{name:/Report\s*· Capsule/}));fireEvent.change(screen.getByLabelText('Reason for reporting'),{target:{value:'Privacy concern'}});fireEvent.click(screen.getByRole('button',{name:'Send report'}));
 await waitFor(()=>expect(mutate).toHaveBeenCalledWith('/reports',{kind:'capsule',targetId:'listing-id',expectedRevision:4,category:'spam',detail:'Privacy concern'},true));
});
