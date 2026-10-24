// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useCommunitySession} from '../lib/client/use-community-session';
import {memberSessionEvent} from '../lib/client/account-navigation';
const api=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../lib/client/member-api',async original=>({...await original(),memberRequest:api.request}));
import {MemberClientError} from '../lib/client/member-api';
const reset=vi.fn(),user={id:'a',name:'A',locale:'ja'};
let identity:typeof user|null,permission:boolean;
beforeEach(()=>{vi.useFakeTimers();reset.mockReset();identity=user;permission=true;Object.defineProperty(document,'hidden',{configurable:true,value:false});api.request.mockReset().mockImplementation(async(path:string)=>{if(path==='/api/member/profile'){if(!identity)throw new MemberClientError(401,'UNAUTHENTICATED');return {user:identity};}if(!permission)throw new MemberClientError(403,'FORBIDDEN');return {communities:[]};});});
afterEach(()=>{cleanup();vi.useRealTimers();});
const tick=()=>act(()=>vi.advanceTimersByTimeAsync(600));
it('同一ユーザーのfocus、pageshow、定期再取得でフォーム世代を変えない',async()=>{
 const {result}=renderHook(()=>useCommunitySession('',reset));await tick();const epoch=result.current.epoch;
 act(()=>window.dispatchEvent(new Event('focus')));await tick();act(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));await tick();await act(()=>vi.advanceTimersByTimeAsync(30000));
 expect(result.current.epoch).toBe(epoch);expect(reset).toHaveBeenCalledTimes(1);expect(result.current.blocked).toBe(false);
});
it('非表示中は隠して保持し、同じ認可なら再表示、別Userなら破棄する',async()=>{
 const {result}=renderHook(()=>useCommunitySession('',reset));await tick();const epoch=result.current.epoch;
 act(()=>{Object.defineProperty(document,'hidden',{value:true});document.dispatchEvent(new Event('visibilitychange'));});expect(result.current.blocked).toBe(true);expect(result.current.data).not.toBeNull();
 act(()=>{Object.defineProperty(document,'hidden',{value:false});document.dispatchEvent(new Event('visibilitychange'));});await tick();expect(result.current.epoch).toBe(epoch);expect(result.current.blocked).toBe(false);
 identity={...user,id:'b'};act(()=>window.dispatchEvent(new Event(memberSessionEvent)));expect(result.current.blocked).toBe(true);await tick();expect(result.current.epoch).toBeGreaterThan(epoch);expect(result.current.user?.id).toBe('b');
});
it('権限失効は内容と入力を破棄する',async()=>{
 const {result}=renderHook(()=>useCommunitySession('',reset));await tick();permission=false;act(()=>window.dispatchEvent(new Event(memberSessionEvent)));await tick();expect(result.current.data).toBeNull();expect(result.current.blocked).toBe(true);expect(reset).toHaveBeenCalledTimes(2);
});
it('遅着した旧認証応答を採用しない',async()=>{
 const {result}=renderHook(()=>useCommunitySession('',reset));await tick();let resolve!:(v:unknown)=>void;
 api.request.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));act(()=>window.dispatchEvent(new Event('focus')));await tick();identity=null;act(()=>window.dispatchEvent(new Event(memberSessionEvent)));await tick();await act(async()=>resolve({user}));expect(result.current.user).toBeNull();
});
it('送信中のfocusはPOSTを中断せず、不明結果の再送IDを保持する',async()=>{
 const {result}=renderHook(()=>useCommunitySession('',reset));await tick();let reject!:(e:Error)=>void;api.request.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r;}));let sending!:ReturnType<typeof result.current.mutate>;
 act(()=>{sending=result.current.mutate('/reports',{detail:'draft',expectedRevision:1},true);});const first=api.request.mock.calls.at(-1)![2];act(()=>window.dispatchEvent(new Event('focus')));expect(first.signal).toBeUndefined();await act(async()=>{reject(new Error('network'));await sending;});await tick();
 await act(async()=>{await result.current.mutate('/reports',{detail:'draft',expectedRevision:2},true);});const writes=api.request.mock.calls.filter(c=>c[2]?.method==='POST');expect(writes[1][2].body).toEqual(writes[0][2].body);
});
