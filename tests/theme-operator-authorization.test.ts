import {it,expect,vi,beforeEach} from 'vitest';
const f=vi.hoisted(()=>({user:null as null|{id:string;active:boolean},session:vi.fn()}));
vi.mock('../lib/server/member/runtime',()=>({memberRuntime:()=>({auth:{api:{getSession:f.session}}})}));
vi.mock('../lib/server/member/site-operations',()=>({isSiteOperator:(id:string)=>id==='operator'}));
import {themeOperator} from '../lib/server/theme-operator-preview';
beforeEach(()=>{f.user=null;f.session.mockReset().mockImplementation(async()=>f.user?{user:f.user}:null);});
it.each([null,{id:'member',active:true},{id:'operator',active:false}])('rejects nonoperator or inactive preview access: %j',async user=>{f.user=user;await expect(themeOperator(new Headers())).rejects.toMatchObject({status:404});});
it('requires an active authenticated operator and bypasses stale cookie-session caches',async()=>{f.user={id:'operator',active:true};expect(await themeOperator(new Headers())).toBe('operator');expect(f.session).toHaveBeenCalledWith(expect.objectContaining({query:{disableCookieCache:true}}));});
