// @vitest-environment jsdom
import {StrictMode} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CommunityDialog} from '../components/CommunityDialog';
import {CommunityMenu,WithdrawPost} from '../components/CommunityPrimitives';
const t=(_:string,en:string)=>en;
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};HTMLDialogElement.prototype.close=function(){this.open=false;};});afterEach(()=>{cleanup();vi.unstubAllGlobals();});
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
it('表示領域の縮小・移動に追随し、通報入力を保持して解除時に背景スクロールを戻す',()=>{
 const viewport=Object.assign(new EventTarget(),{width:390,height:800,offsetLeft:0,offsetTop:0});vi.stubGlobal('visualViewport',viewport);
 const {unmount}=render(<CommunityDialog title="Report" onCancel={()=>{}}><textarea aria-label="Reason" defaultValue="draft"/><button>Cancel</button></CommunityDialog>);
 const dialog=screen.getByRole('dialog');expect(dialog.style.top).toBe('400px');expect(document.body.style.overflow).toBe('hidden');
 Object.assign(viewport,{height:360,offsetTop:120});viewport.dispatchEvent(new Event('resize'));expect(dialog.style.top).toBe('300px');expect(dialog.style.getPropertyValue('--dialog-height')).toBe('360px');expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe('draft');
 unmount();expect(document.body.style.overflow).toBe('');
});
it('補助メニューはスクロール後も起点を追い、表示領域内へ上下を切り替える',()=>{
 const viewport=Object.assign(new EventTarget(),{width:320,height:500,offsetLeft:0,offsetTop:0});vi.stubGlobal('visualViewport',viewport);
 const {container}=render(<CommunityMenu label="Post actions" compact><button>Report</button></CommunityMenu>);
 const trigger=screen.getByLabelText('Post actions'),panel=container.querySelector<HTMLElement>('[data-menu-panel]')!,details=container.querySelector('details')!;
 let anchorTop=440;vi.spyOn(trigger,'getBoundingClientRect').mockImplementation(()=>({left:260,right:304,top:anchorTop,bottom:anchorTop+44,width:44,height:44,x:260,y:anchorTop,toJSON(){}}));
 vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({left:0,right:208,top:0,bottom:100,width:208,height:100,x:0,y:0,toJSON(){}});
 fireEvent.click(trigger);fireEvent(details,new Event('toggle'));expect(panel.style.top).toBe('334px');expect(panel.style.left).toBe('96px');expect(details.hasAttribute('data-floating-menu')).toBe(true);
 anchorTop=100;fireEvent.scroll(window);expect(panel.style.top).toBe('150px');
});