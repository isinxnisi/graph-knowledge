// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import KnowledgeSubmissionFeedbackCard from "../components/KnowledgeSubmissionFeedbackCard";
import {getMemberIdentitySnapshot,invalidateMemberIdentity,refreshMemberIdentity} from "../lib/client/use-member-identity";
import {PUBLICATION_CONSENT_VERSION} from "../lib/domain/knowledge-review-job";
import {reviewDisclosureForConsent,type SubmissionFeedback} from "../lib/domain/knowledge-submission-feedback";
vi.mock("../lib/client/ui-locale",()=>({useUiLocale:()=>({locale:"ja"})}));
const fetcher=vi.fn(),user={id:"00000000-0000-4000-8000-000000000001",name:"A",locale:"ja"},submissionId="10000000-0000-4000-8000-000000000001";
function result(cursor="41"):SubmissionFeedback{return {receipts:[{revision:1,submittedAt:"2026-11-04T01:00:00Z",title:"送った内容",itemCount:1,unread:true}],receipt:{revision:1,submittedAt:"2026-11-04T01:00:00Z",title:"送った内容",digest:"digest",current:true,cancelled:false,workerAvailable:true,items:[{key:"item-one",assertion:"NASAが望遠鏡を打ち上げた",state:"needs-changes",reason:"資料の該当部分を加えてください。",nextAttemptAt:null}],eventCursor:cursor,unread:true,disclosure:reviewDisclosureForConsent(PUBLICATION_CONSENT_VERSION)}};}
beforeEach(async()=>{vi.stubGlobal("fetch",fetcher);fetcher.mockReset();invalidateMemberIdentity();fetcher.mockResolvedValueOnce(Response.json({user}));await refreshMemberIdentity();});
afterEach(()=>{cleanup();history.replaceState({},"","/");Reflect.deleteProperty(navigator,"clipboard");vi.restoreAllMocks();vi.unstubAllGlobals();});
it('explains an existing fact without presenting another publication or activity',async()=>{
 const value=result();Object.assign(value.receipt!.items[0],{state:'published',reason:'同じ知識が登録済みです。',publication:{id:'existing-fact',revision:2,state:'published',reason:'',disposition:'existing'}});
 fetcher.mockResolvedValueOnce(Response.json(value));render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={1}/>);
 await screen.findByRole('heading',{name:'登録済みの知識です'});
 expect(screen.getAllByRole('link',{name:'登録済みの知識を開く'})[0].getAttribute('href')).toBe('/?krecord=existing-fact');
 expect(screen.getAllByText('同じ知識が登録されています。記録や活動履歴は増やしていません。').length).toBeGreaterThan(0);
});
it("actionable feedback is visible above details; simply reading does not mark it read",async()=>{
 fetcher.mockResolvedValueOnce(Response.json(result()));const go=vi.fn();render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={1} onSelectItem={go}/>);
 await screen.findByRole("heading",{name:"補足が必要です"});expect(screen.getAllByText("資料の該当部分を加えてください。").length).toBeGreaterThan(0);
 expect(fetcher.mock.calls.every(call=>call[1]?.method!=="POST")).toBe(true);
 fireEvent.click(screen.getByRole("button",{name:"該当する項目を確認"}));expect(go).toHaveBeenCalledWith("item-one");
 fetcher.mockResolvedValueOnce(Response.json({unreadCount:0,submissionIds:[]}));fireEvent.click(screen.getByRole("button",{name:"結果を確認した"}));
 await act(async()=>{});expect(fetcher.mock.calls.at(-1)?.[1]).toMatchObject({method:"POST",headers:{"X-Member-User":user.id},body:JSON.stringify({action:"acknowledge",submissionId,revision:1,throughEventId:"41"})});
 expect(screen.queryByRole("button",{name:"結果を確認した"})).toBeNull();
});
it("an older submitted receipt remains explicit when the current form is a new draft",async()=>{
 const data=result();data.receipt!.current=false;fetcher.mockResolvedValueOnce(Response.json(data));render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={2} dirty/>);
 await screen.findByRole("heading",{name:"補足が必要です"});expect(screen.getByText(/送信した時点の内容への結果/)).toBeTruthy();expect(screen.queryByRole("button",{name:"該当する項目を確認"})).toBeNull();
});
it("a result arriving during acknowledgement stays unread, and only the shown cursor is sent",async()=>{
 fetcher.mockResolvedValueOnce(Response.json(result()));render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={1}/>);await screen.findByRole("button",{name:"結果を確認した"});
 let finish!:(r:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));fireEvent.click(screen.getByRole("button",{name:"結果を確認した"}));
 fetcher.mockResolvedValueOnce(Response.json(result("42")));fireEvent.click(screen.getByRole("button",{name:"確認結果を更新"}));await act(async()=>{});
 await act(async()=>{finish(Response.json({unreadCount:1,submissionIds:[submissionId]}));});expect(screen.getByRole("button",{name:"結果を確認した"})).toBeTruthy();
 expect(JSON.parse(fetcher.mock.calls.find(call=>call[1]?.method==="POST")![1].body).throughEventId).toBe("41");
});
it("offline keeps loaded results while account invalidation immediately hides them and rejects a late response",async()=>{
 fetcher.mockResolvedValueOnce(Response.json(result()));render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={1}/>);await screen.findByRole("heading",{name:"補足が必要です"});
 fetcher.mockRejectedValueOnce(new Error("offline"));fireEvent.click(screen.getByRole("button",{name:"確認結果を更新"}));await screen.findByText(/取得済みの結果/);expect(screen.getByRole("heading",{name:"補足が必要です"})).toBeTruthy();
 let finish!:(r:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));fireEvent.click(screen.getByRole("button",{name:"確認結果を更新"}));const previous=getMemberIdentitySnapshot().version;
 act(()=>invalidateMemberIdentity());expect(screen.queryByRole("heading",{name:"補足が必要です"})).toBeNull();await act(async()=>{finish(Response.json(result()));});expect(getMemberIdentitySnapshot().version).toBeGreaterThan(previous);expect(screen.queryByRole("heading",{name:"補足が必要です"})).toBeNull();
});

it("receiving the same saved revision refreshes feedback through stateVersion",async()=>{
 fetcher.mockResolvedValueOnce(Response.json({receipts:[],receipt:null}));const view=render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={1} stateVersion={1}/>);await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
 expect(screen.queryByRole("heading",{name:"補足が必要です"})).toBeNull();fetcher.mockResolvedValueOnce(Response.json(result()));view.rerender(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={1} stateVersion={2}/>);
 await screen.findByRole("heading",{name:"補足が必要です"});
});

it("a private receipt URL reads the fixed version, preserves URL selection and copies only that context",async()=>{
 history.replaceState({},"",`/member/submissions?id=${submissionId}&receipt=1`);const first=result();first.receipt!.current=false;first.receipts.unshift({revision:2,submittedAt:"2026-11-04T02:00:00Z",title:"新しい受付",itemCount:1,unread:true});
 fetcher.mockResolvedValueOnce(Response.json(first));render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={2}/>);await screen.findByRole("heading",{name:"補足が必要です"});
 expect(new URL(fetcher.mock.calls.at(-1)![0],"https://example.invalid").searchParams.get("revision")).toBe("1");
 const next=result("42");next.receipt!.revision=2;next.receipts=first.receipts;fetcher.mockResolvedValueOnce(Response.json(next));fireEvent.change(screen.getByLabelText("確認する受付版"),{target:{value:"2"}});await waitFor(()=>expect((screen.getByLabelText("確認する受付版") as HTMLSelectElement).value).toBe("2"));expect(new URL(location.href).searchParams.get("receipt")).toBe("2");
 const copy=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:copy}});fireEvent.click(screen.getByRole("button",{name:"この受付版へのリンクをコピー（本人用）"}));await screen.findByText("本人用のリンクをコピーしました。");
 const copied=new URL(copy.mock.calls[0][0]);expect(copied.searchParams.get("id")).toBe(submissionId);expect(copied.searchParams.get("receipt")).toBe("2");expect(copied.searchParams.has("userId")).toBe(false);
});

it("repeated refreshes share an in-flight result read rather than starving a slow connection",async()=>{
 fetcher.mockResolvedValueOnce(Response.json(result()));render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={1}/>);await screen.findByRole("heading",{name:"補足が必要です"});
 let finish!:(r:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const before=fetcher.mock.calls.length;
 fireEvent.click(screen.getByRole("button",{name:"確認結果を更新"}));fireEvent.click(screen.getByRole("button",{name:"確認結果を更新"}));expect(fetcher.mock.calls).toHaveLength(before+1);
 const next=result("42");next.receipt!.items[0].reason="新しく届いた確認結果";await act(async()=>{finish(Response.json(next));});expect(screen.getAllByText("新しく届いた確認結果").length).toBeGreaterThan(0);
});

it("published feedback exposes a public-record link above collapsed details and one per item",async()=>{
 const data=result();data.receipt!.items=[{key:"one",assertion:"公開された事実1",state:"published",reason:"公開しました",nextAttemptAt:null,publication:{id:"public:record-one",revision:2,state:"published",reason:""}},{key:"two",assertion:"公開された事実2",state:"published",reason:"公開しました",nextAttemptAt:null,publication:{id:"public:record-two",revision:4,state:"published",reason:""}}];
 fetcher.mockResolvedValueOnce(Response.json(data));const view=render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={1}/>);await screen.findByRole("heading",{name:"公開しました"});
 expect([...view.container.querySelectorAll("a")].filter(a=>!a.closest("details"))).toHaveLength(1);expect(view.container.querySelector("details")?.open).toBe(false);expect(screen.getByText(/ほか1件は項目ごとの結果から/)).toBeTruthy();
 const links=[...view.container.querySelectorAll<HTMLAnchorElement>('a')];expect(links).toHaveLength(3);expect(links.map(a=>a.getAttribute("href"))).toContain("/?krecord=public%3Arecord-two");
 for(const link of links){expect(link.target).toBe("_blank");expect(link.rel).toContain("noopener");expect(link.rel).toContain("noreferrer");expect(new URL(link.href).searchParams.has("revision")).toBe(false);}
 expect(screen.getByText(/公開先では現在の内容を表示します/)).toBeTruthy();expect(view.container.textContent).toContain("公開した内容版 2");expect(view.container.textContent).toContain("公開した内容版 4");
});
it("a prepared publication is not presented as a readable public result",async()=>{
 const data=result();data.receipt!.items[0]={...data.receipt!.items[0],state:"accepted",reason:"公開へ反映中",publication:{id:"not-yet-public",revision:1,state:"pending",reason:""}};
 fetcher.mockResolvedValueOnce(Response.json(data));render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={1}/>);await screen.findByRole("heading",{name:"公開へ反映中"});expect(screen.queryByRole("link",{name:"公開先を開く"})).toBeNull();
});

it("a current operator block is distinguished from the successful historical publication",async()=>{
 const data=result();data.receipt!.items[0]={...data.receipt!.items[0],state:'published',publication:{id:'public-record',revision:1,state:'published',reason:''},appeal:{id:submissionId,revision:3,status:'answered',pending:false,detail:'Request',createdAt:'2026-11-04T01:00:00Z',replies:[],moderation:{state:'applied',visibility:'hidden',reason:''}}};fetcher.mockResolvedValueOnce(Response.json(data));render(<KnowledgeSubmissionFeedbackCard submissionId={submissionId} userId={user.id} currentRevision={1}/>);await screen.findByRole('heading',{name:'公開を停止しました'});expect(screen.queryByRole('link',{name:'公開先を開く'})).toBeNull();expect(screen.getByText('公開履歴 1件 · 1項目')).toBeTruthy();
});
