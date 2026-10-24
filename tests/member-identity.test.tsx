// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useMemberSession,usePendingInvitations,refreshMemberIdentity,refreshPendingInvitations,invalidateMemberIdentity} from '../lib/client/use-member-identity';
const fetcher=vi.fn(),user={id:'00000000-0000-4000-8000-000000000001',name:'A',locale:'ja'};
beforeEach(()=>{vi.stubGlobal('fetch',fetcher);fetcher.mockReset();invalidateMemberIdentity();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('初回確認中はguestではなく、401で初めて未ログインを確定する',async()=>{
 const {result}=renderHook(()=>useMemberSession());expect(result.current.status).toBe('checking');fetcher.mockResolvedValue(Response.json({error:{code:'UNAUTHENTICATED'}},{status:401}));await act(async()=>{await refreshMemberIdentity();});expect(result.current.status).toBe('guest');
});
it('遅延・重複要求を一本化し、既知本人の再確認中も表示情報を保持する',async()=>{
 const {result}=renderHook(()=>useMemberSession());fetcher.mockResolvedValueOnce(Response.json({user}));await act(async()=>{await refreshMemberIdentity();});let resolve!:(r:Response)=>void;fetcher.mockImplementation(()=>new Promise(r=>{resolve=r;}));let first!:Promise<unknown>,second!:Promise<unknown>;
 act(()=>{first=refreshMemberIdentity(true);second=refreshMemberIdentity(true);});expect(first).toBe(second);expect(result.current.user).toEqual(user);expect(result.current.rechecking).toBe(true);await act(async()=>{resolve(Response.json({user}));await first;});expect(fetcher).toHaveBeenCalledTimes(2);
});
it('失敗はguestではなくerror、既知本人のメニューも消さない',async()=>{
 const {result}=renderHook(()=>useMemberSession());fetcher.mockRejectedValue(new Error('offline'));await act(async()=>{await refreshMemberIdentity().catch(()=>{});});expect(result.current.status).toBe('error');fetcher.mockResolvedValueOnce(Response.json({user}));await act(async()=>{await refreshMemberIdentity(true);});await act(async()=>{await refreshMemberIdentity(true).catch(()=>{});});expect(result.current.user).toEqual(user);expect(result.current.error).toBe(true);
});
it('別User・ログアウト通知後の旧応答を共有表示へ採用しない',async()=>{
 let resolve!:(r:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const {result}=renderHook(()=>useMemberSession());let old!:Promise<unknown>;act(()=>{old=refreshMemberIdentity().catch(()=>{});invalidateMemberIdentity();});fetcher.mockResolvedValue(Response.json({error:{code:'UNAUTHENTICATED'}},{status:401}));await act(async()=>{await refreshMemberIdentity();resolve(Response.json({user}));await old;});expect(result.current.status).toBe('guest');expect(result.current.user).toBeNull();
});
it('招待は未取得・失敗を0とせず、一覧を見ても消費せず、別Userへ漏らさない',async()=>{
 fetcher.mockResolvedValueOnce(Response.json({user}));await refreshMemberIdentity();const {result}=renderHook(()=>usePendingInvitations());expect(result.current.count).toBeNull();fetcher.mockResolvedValueOnce(Response.json({pendingCount:12}));await act(async()=>{await refreshPendingInvitations();});expect(result.current.count).toBe(12);fetcher.mockRejectedValueOnce(new Error('offline'));await act(async()=>{await refreshPendingInvitations();});expect(result.current.status).toBe('error');expect(result.current.count).toBeNull();act(()=>invalidateMemberIdentity());expect(result.current.owner).toBeNull();
});
