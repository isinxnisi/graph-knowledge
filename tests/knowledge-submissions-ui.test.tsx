// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {knowledgeSubmissionContentSchema,type KnowledgeSubmission} from "../lib/domain/knowledge-submission";
const mocked=vi.hoisted(()=>({identity:{status:"authenticated",user:{id:"10000000-0000-4000-8000-000000000001"},error:false,version:1,rechecking:false}}));
vi.mock("../lib/client/use-member-identity",()=>({useMemberSession:()=>mocked.identity,getMemberIdentitySnapshot:()=>mocked.identity,refreshMemberIdentity:vi.fn(async()=>mocked.identity.user),invalidateMemberIdentity:vi.fn()}));
vi.mock("../components/PersonalFrame",()=>({PersonalMemberControls:()=>null}));
vi.mock("../lib/client/ui-locale",()=>({useUiLocale:()=>({locale:"ja"})}));
import KnowledgeSubmissions from "../components/KnowledgeSubmissions";
const stored=new Map<string,KnowledgeSubmission>(),sent:Record<string,unknown>[]=[];
let failNext=false,loadFailure=false,postGate:Promise<void>|null=null,reviewAvailable=false,finishReview=false,publishing=false;
const stamp="2026-11-03T09:00:00Z";
const summary=()=>[...stored.values()].map(s=>({id:s.id,state:s.state,title:s.content.title,revision:s.revision,version:s.version,itemCount:s.content.items.length,updatedAt:s.updatedAt}));
beforeEach(()=>{
 history.replaceState({},"","/member/submissions");stored.clear();sent.length=0;failNext=false;loadFailure=false;postGate=null;reviewAvailable=false;finishReview=false;publishing=false;mocked.identity={status:"authenticated",user:{id:"10000000-0000-4000-8000-000000000001"},error:false,version:1,rechecking:false};
 vi.stubGlobal("fetch",vi.fn(async(path:string,init?:RequestInit)=>{
  if(path.startsWith('/api/knowledge/public'))return Response.json({generation:'published',record:{record:{id:'public-record',revision:1,content:{assertion:'公開済みの知識'}}}});
  if(path.endsWith('/advice'))return Response.json({error:{code:'UNAVAILABLE'}},{status:503});
  if(init?.method==="POST"){

   if(postGate)await postGate;
   const body=JSON.parse(String(init.body));sent.push(body);if(failNext){failNext=false;throw Error("delivery unknown");}
   if(body.action==='capture-public'){const value:KnowledgeSubmission={id:body.id,revision:1,version:1,state:'draft',digest:'a'.repeat(64),createdAt:stamp,updatedAt:stamp,origin:null,content:knowledgeSubmissionContentSchema.parse({title:'公開済みの知識',items:[{key:'public-record',correction:{id:'public-record',revision:1},record:{kind:'note',assertion:'公開済みの知識',evidence:[]}}]})};stored.set(body.id,value);return Response.json({submission:value});}
   if(body.action==='review'){const old=stored.get(body.id)!;old.review={revision:old.revision,workerAvailable:true,items:old.content.items.map(item=>({key:item.key,state:'queued',reason:'',attempts:0,nextAttemptAt:null,result:null})).reverse()};return Response.json({submission:old});}
   const old=stored.get(body.id);const content=body.content?knowledgeSubmissionContentSchema.parse(body.content):old!.content;
   const submission:KnowledgeSubmission={id:body.id,revision:body.action==="save"?(old?.revision??0)+1:old!.revision,version:(old?.version??0)+1,state:body.action==="save"?"draft":body.action==="submit"?"queued":"cancelled",content,digest:"a".repeat(64),createdAt:stamp,updatedAt:stamp,origin:null};stored.set(body.id,submission);return Response.json({submission});
  }
  if(path==="/api/member/knowledge-submissions"&&loadFailure)return Response.json({error:{code:"INTERNAL_ERROR"}},{status:500});
  if(path==="/api/member/knowledge-submissions")return Response.json({submissions:summary(),processing:publishing?"publishing-beta":reviewAvailable?"gemini-beta":"not-connected",consentVersion:publishing?"gemini-publication-beta-v1":"gemini-public-beta-v1"});
  const id=path.split("/").at(-1)!;
  if(finishReview&&stored.get(id)?.review)stored.get(id)!.review!.items=stored.get(id)!.review!.items.map(item=>({...item,state:'reviewed',reason:'根拠と一致',result:{suitability:'legitimate',support:'supported',reason:'根拠と一致'}}));
return stored.has(id)?Response.json({submission:stored.get(id)}):Response.json({error:{code:"NOT_FOUND"}},{status:404});
 }));
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
async function write(){render(<KnowledgeSubmissions/>);await screen.findByText("まだ投稿はありません。知識を書くか、保存済みCapsuleの一部から始められます。");fireEvent.click(screen.getByRole("button",{name:"知識を書く"}));fireEvent.change(screen.getByLabelText("投稿のタイトル"),{target:{value:"投稿のテスト"}});fireEvent.change(screen.getByLabelText("内容",{exact:true}),{target:{value:"架空の観測所は2003年に設立された。"}});}
describe("member knowledge submission workflow",()=>{
 it("does not turn a failed initial fetch into an empty submission history",async()=>{
  loadFailure=true;render(<KnowledgeSubmissions/>);await screen.findByRole("alert");expect(screen.queryByText("まだ投稿はありません。知識を書くか、保存済みCapsuleの一部から始められます。")).toBeNull();loadFailure=false;fireEvent.click(screen.getByRole("button",{name:"一覧を更新"}));await screen.findByText("まだ投稿はありません。知識を書くか、保存済みCapsuleの一部から始められます。");
 });
 it("saves and submits with one explicit intent and shows the unconnected processing state honestly",async()=>{
  await write();fireEvent.click(screen.getByRole("button",{name:"保存して受付"}));await screen.findByText("受付を保存しました。AI処理と公開の接続は準備中です。");
  expect(sent.map(c=>c.action)).toEqual(["save","submit"]);expect(sent[1].expectedVersion).toBe(1);expect(stored.size).toBe(1);
  expect(screen.getByRole("button",{name:"この版を受付"}).hasAttribute("disabled")).toBe(true);
 });
 it("distinguishes a running save from an ambiguous failure",async()=>{
  await write();let release!:()=>void;postGate=new Promise<void>(resolve=>{release=resolve;});fireEvent.click(screen.getByRole("button",{name:"草稿を保存"}));
  await screen.findByText("操作を保存しています…");expect(screen.queryByRole("button",{name:"同じ操作を再試行"})).toBeNull();
  await act(async()=>{release();});await screen.findByText("草稿を保存しました。");
 });
 it("retains input and reuses the operation ID after an ambiguous failure",async()=>{
  await write();failNext=true;fireEvent.click(screen.getByRole("button",{name:"草稿を保存"}));await screen.findByRole("button",{name:"同じ操作を再試行"});
  expect((screen.getByLabelText("内容",{exact:true}) as HTMLTextAreaElement).value).toContain("架空の観測所");
  fireEvent.click(screen.getByRole("button",{name:"同じ操作を再試行"}));await waitFor(()=>expect(stored.size).toBe(1));await waitFor(()=>expect(screen.queryByRole("button",{name:"同じ操作を再試行"})).toBeNull());expect(sent).toHaveLength(2);expect(sent[0]).toEqual(sent[1]);
 });
 it("lets users remove an unfinished source and save a source-less draft",async()=>{
  await write();fireEvent.click(screen.getByRole("button",{name:"根拠を追加"}));fireEvent.click(screen.getByRole("button",{name:"この根拠を外す"}));fireEvent.click(screen.getByRole("button",{name:"草稿を保存"}));await screen.findByText("草稿を保存しました。");expect([...stored.values()][0].content.sources).toEqual([]);
 });
 it("cancels only after an inline confirmation, leaving the source draft readable",async()=>{
  await write();fireEvent.click(screen.getByRole("button",{name:"保存して受付"}));await screen.findByText("受付を保存しました。AI処理と公開の接続は準備中です。");fireEvent.click(screen.getByRole("button",{name:"投稿を取り消す"}));expect(sent).toHaveLength(2);
  fireEvent.click(screen.getByRole("button",{name:"取り消す"}));await screen.findByText("取り消されています。再提出は新しい草稿から行ってください。");expect(sent.at(-1)).toMatchObject({action:"cancel",expectedVersion:2});
 });
 it('requires explicit transmission intent and does not block submission when local hints fail',async()=>{
  reviewAvailable=true;await write();fireEvent.click(screen.getByRole('button',{name:'保存してAI確認へ'}));expect(sent).toHaveLength(0);expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'草稿を保存'}));await screen.findByText('草稿を保存しました。');
  fireEvent.click(screen.getByRole('button',{name:'送信前のヒント（任意）'}));await screen.findByText('今はヒントを確認できません。そのまま投稿できます。');
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'AI確認へ進む'}));await screen.findByText('AI確認を依頼しました。画面を閉じても受付は残ります。');
  expect(sent.map(c=>c.action)).toEqual(['save','submit','review']);
 });
 it('refreshes review results without replacing unsaved edits',async()=>{
  reviewAvailable=true;await write();vi.useFakeTimers();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'保存してAI確認へ'}));await act(async()=>{});
  expect(screen.getByText('AI確認を依頼しました。画面を閉じても受付は残ります。')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('内容',{exact:true}),{target:{value:'途中の編集を保持する。'}});finishReview=true;
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect((screen.getByLabelText('内容',{exact:true}) as HTMLTextAreaElement).value).toBe('途中の編集を保持する。');expect(screen.getByText('変更前の受付内容への結果です。保存して受付し直すと、新しい内容で確認します。')).toBeTruthy();
 });

 it('requires the publication-specific intent and sends the server selected consent version',async()=>{
  publishing=true;await write();expect(screen.getByRole('checkbox').textContent).not.toContain('まだ');
  fireEvent.click(screen.getByRole('button',{name:'保存して知識を届ける'}));expect(sent).toHaveLength(0);
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'保存して知識を届ける'}));await screen.findByText('受け付けました。確認結果と公開先をここにお知らせします。');
  expect(sent.at(-1)).toMatchObject({action:'review',consentVersion:'gemini-publication-beta-v1'});
 });

 it('keeps results in submitted item order when jobs arrive in another order',async()=>{
  publishing=true;await write();fireEvent.click(screen.getByRole('button',{name:'項目を追加'}));fireEvent.change(screen.getAllByLabelText('内容',{exact:true})[1],{target:{value:'二つ目の知識。'}});
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'保存して知識を届ける'}));await screen.findByText('受け付けました。確認結果と公開先をここにお知らせします。');
  const rows=within(screen.getByRole('region',{name:'受付版のAI確認'})).getAllByRole('listitem');expect(rows[0].textContent).toContain('項目 1');expect(rows[1].textContent).toContain('項目 2');
 });

 it('previews a public correction without writing and captures the source edition only on explicit action',async()=>{
  publishing=true;history.replaceState({},'', '/member/submissions?record=public-record&revision=1');render(<KnowledgeSubmissions/>);
  await screen.findByRole('button',{name:'訂正の草稿を作る'});expect(sent).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'訂正の草稿を作る'}));await screen.findByLabelText('内容',{exact:true});
  expect(sent[0]).toMatchObject({action:'capture-public',recordId:'public-record',recordRevision:1});expect(sent[0]).not.toHaveProperty('snapshot');expect(screen.getByRole('checkbox').getAttribute('checked')).toBeNull();
 });
 it("removes private input when the account changes",async()=>{
  await write();const view=screen.getByLabelText("内容",{exact:true});expect(view).not.toBeNull();mocked.identity={...mocked.identity,status:"guest",user:null as unknown as {id:string},version:2};
  await act(async()=>{cleanup();render(<KnowledgeSubmissions/>);});expect(screen.queryByLabelText("内容",{exact:true})).toBeNull();expect(screen.getByRole("button",{name:"Googleでログイン"})).not.toBeNull();
 });
});
