// @vitest-environment jsdom
import {StrictMode} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CommunityMenu,WithdrawPost} from '../components/CommunityPrimitives';
const t=(_:string,en:string)=>en;
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};HTMLDialogElement.prototype.close=function(){this.open=false;};});afterEach(cleanup);
it('補助メニューは Escape と外側操作で閉じ、Escape は起点へフォーカスを返す',()=>{
 const {container}=render(<><CommunityMenu label="Post actions" compact><button>Report</button></CommunityMenu><button>Outside</button></>);
 const trigger=screen.getByLabelText('Post actions');fireEvent.click(trigger);const details=container.querySelector('details')!;expect(details.open).toBe(true);screen.getByText('Report').focus();fireEvent.keyDown(screen.getByText('Report'),{key:'Escape'});expect(details.open).toBe(false);expect(document.activeElement).toBe(trigger);fireEvent.click(trigger);fireEvent.pointerDown(screen.getByText('Outside'));expect(details.open).toBe(false);
});
it('撤回は確認・取消・失敗を区別し、成功前に確認画面を消さない',async()=>{
 const confirm=vi.fn().mockResolvedValueOnce({ok:false}).mockResolvedValue({ok:true});
 render(<CommunityMenu label="Post actions" compact><WithdrawPost t={t} busy={false} onConfirm={confirm}/></CommunityMenu>);
 fireEvent.click(screen.getByLabelText('Post actions'));fireEvent.click(screen.getByRole('button',{name:'Withdraw my post'}));expect(screen.getByRole('dialog').parentElement).toBe(document.body);fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(confirm).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Withdraw my post'}));fireEvent.click(screen.getByRole('button',{name:/^Withdraw$/}));await screen.findByRole('alert');expect(screen.getByRole('dialog')).toBeDefined();fireEvent.click(screen.getByRole('button',{name:/^Withdraw$/}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(confirm).toHaveBeenCalledTimes(2);
});
it('Strict Mode の再実行でも確認前のボタンを覚え、取消後に復帰する',async()=>{
 render(<StrictMode><CommunityMenu label="Post actions" compact><WithdrawPost t={t} busy={false} onConfirm={async()=>({ok:true})}/></CommunityMenu></StrictMode>);
 fireEvent.click(screen.getByLabelText('Post actions'));const trigger=screen.getByRole('button',{name:'Withdraw my post'});trigger.focus();fireEvent.click(trigger);fireEvent.click(screen.getByRole('button',{name:'Cancel'}));await waitFor(()=>expect(document.activeElement).toBe(trigger));
});