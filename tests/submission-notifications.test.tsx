// @vitest-environment jsdom
import {act,cleanup,renderHook} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {acceptSubmissionNotificationSummary,refreshSubmissionNotifications,useSubmissionNotifications} from "../lib/client/use-submission-notifications";
import {getMemberIdentitySnapshot,invalidateMemberIdentity,refreshMemberIdentity} from "../lib/client/use-member-identity";
const fetcher=vi.fn(),user={id:"00000000-0000-4000-8000-000000000001",name:"A",locale:"ja"},submissionId="10000000-0000-4000-8000-000000000001";
beforeEach(()=>{vi.stubGlobal("fetch",fetcher);fetcher.mockReset();invalidateMemberIdentity();});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function signIn(){fetcher.mockResolvedValueOnce(Response.json({user}));await refreshMemberIdentity();}
it("summary shares one request, uses expected owner, and keeps known count while offline",async()=>{
 await signIn();fetcher.mockResolvedValueOnce(Response.json({unreadCount:1,submissionIds:[submissionId]}));await Promise.all([refreshSubmissionNotifications(),refreshSubmissionNotifications()]);
 const {result}=renderHook(()=>useSubmissionNotifications());expect(result.current.data?.unreadCount).toBe(1);
 expect(fetcher.mock.calls[1][1]).toMatchObject({headers:{"X-Member-User":user.id},cache:"no-store"});
 const calls=fetcher.mock.calls.length;await refreshSubmissionNotifications();expect(fetcher.mock.calls).toHaveLength(calls);
 fetcher.mockRejectedValueOnce(new Error("offline"));await act(async()=>{await refreshSubmissionNotifications(true);});
 expect(result.current).toMatchObject({status:"ready",data:{unreadCount:1},refreshError:true});
 expect(getMemberIdentitySnapshot().user?.id).toBe(user.id);
});
it("a receipt acknowledgement invalidates the older in-flight count",async()=>{
 await signIn();let finish!:(r:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const old=refreshSubmissionNotifications();
 const {result}=renderHook(()=>useSubmissionNotifications());
 act(()=>acceptSubmissionNotificationSummary(user.id,getMemberIdentitySnapshot().version,{unreadCount:0,submissionIds:[]}));
 await act(async()=>{finish(Response.json({unreadCount:1,submissionIds:[submissionId]}));await old;});expect(result.current.data?.unreadCount).toBe(0);
});
it("switching account hides private state immediately and discards a late summary even after same-user login",async()=>{
 await signIn();fetcher.mockResolvedValueOnce(Response.json({unreadCount:1,submissionIds:[submissionId]}));await refreshSubmissionNotifications();
 const {result}=renderHook(()=>useSubmissionNotifications());let finish!:(r:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));let old!:Promise<void>;
 act(()=>{old=refreshSubmissionNotifications(true);invalidateMemberIdentity();});expect(result.current.data).toBeNull();
 fetcher.mockResolvedValueOnce(Response.json({user}));fetcher.mockResolvedValueOnce(Response.json({unreadCount:0,submissionIds:[]}));
 await act(async()=>{await refreshMemberIdentity();});await act(async()=>{finish(Response.json({unreadCount:1,submissionIds:[submissionId]}));await old;});
 expect(result.current.data?.unreadCount).toBe(0);
});
it("periodic summary checks do not refresh authentication or run while hidden",async()=>{
 vi.useFakeTimers();let hidden=false;vi.spyOn(document,"hidden","get").mockImplementation(()=>hidden);await signIn();
 fetcher.mockImplementation(async()=>Response.json({unreadCount:0,submissionIds:[]}));renderHook(()=>useSubmissionNotifications());await act(async()=>{});
 expect(fetcher.mock.calls.filter(call=>call[0]==="/api/member/profile")).toHaveLength(1);
 hidden=true;await act(async()=>{await vi.advanceTimersByTimeAsync(180000);});expect(fetcher).toHaveBeenCalledTimes(2);
 hidden=false;await act(async()=>{document.dispatchEvent(new Event("visibilitychange"));});expect(fetcher).toHaveBeenCalledTimes(3);
 expect(fetcher.mock.calls.filter(call=>call[0]==="/api/member/profile")).toHaveLength(1);
});
