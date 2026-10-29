// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, act, within } from "@testing-library/react";
import { randomUUID } from "node:crypto";
import type { LocalCapsule } from "../lib/client/local-capsules";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import type { IdentityState } from "../lib/client/use-member-identity";

const mocks = vi.hoisted(() => ({ api: vi.fn(), browser: vi.fn(), refresh: vi.fn(), identity: { status:"checking",user:null,rechecking:false,error:false,version:0 } as IdentityState }));
vi.mock("../lib/client/member-api", async () => ({ ...await vi.importActual("../lib/client/member-api"), memberRequest:mocks.api }));
vi.mock("../lib/client/use-member-identity", () => ({ useMemberSession:()=>mocks.identity,refreshMemberIdentity:mocks.refresh,getMemberIdentitySnapshot:()=>mocks.identity,invalidateMemberIdentity:()=>{mocks.identity={status:"checking",user:null,rechecking:false,error:false,version:mocks.identity.version+1};} }));
vi.mock("../lib/client/ui-locale", () => ({useUiLocale:()=>({locale:"en"})}));
vi.mock("../lib/client/capsule-store", () => ({saveBrowserCapsule:mocks.browser,listBrowserCapsules:vi.fn().mockResolvedValue([]),capsuleMetadata:vi.fn().mockImplementation(async(id:string)=>({id,favorite:false,lastOpened:null}))}));
vi.mock("../components/CapsuleShareControls", () => ({default:()=>null}));
vi.mock("../components/CapsuleStudio", async () => {
  const {useState} = await import("react");
  return {default:function Studio({capsule,onSave,locked,destination}:{capsule:LocalCapsule;onSave:(value:LocalCapsule,copy:boolean)=>Promise<LocalCapsule>;locked:boolean;destination:string}) {
    const [title,setTitle]=useState(capsule.title),[status,setStatus]=useState(""),[error,setError]=useState("");
    async function save(copy:boolean) {setError("");setStatus("saving");try{const result=await onSave({...capsule,title},copy);setTitle(result.title);setStatus("saved");}catch(cause){setStatus("");setError(cause instanceof Error?cause.message:String(cause));}}
    if(locked)return <p>locked</p>;
    return <section><p>{destination}</p><div data-testid="canvas"><label>Draft title<input value={title} onChange={e=>setTitle(e.target.value)}/></label><button onClick={()=>void save(false)}>Save draft</button><button onClick={()=>void save(true)}>Save copy</button><output>{status}</output><output data-testid="document-nodes">{capsule.document?.nodes.length??'missing'}</output>{error&&<p role="alert">{error}</p>}</div></section>;
  }};
});
import MyCapsules, { CapsuleWorkspace } from "../components/MyCapsules";
import { capsuleMetadata } from "../lib/client/capsule-store";
import { memberListSchema } from "../lib/client/member-api";

const a={id:"10000000-0000-4000-8000-000000000001",name:"A",locale:"ja"},b={...a,id:"10000000-0000-4000-8000-000000000002",name:"B"};
function authenticated(user=a) {mocks.identity={status:"authenticated",user,rechecking:false,error:false,version:mocks.identity.version+1};}
function capsule():LocalCapsule {const key=randomUUID();return {id:randomUUID(),revision:1,dataset:"demo",title:"Original draft",note:"private content",language:"ja",createdAt:"2026-10-29T00:00:00Z",entityIds:[],claimIds:[],document:{schemaVersion:1,nodes:[{key,title:"Local node",description:"",badge:"",origin:{kind:"local"}}],relations:[],texts:[],evidence:[],unresolvedClaimIds:[],layout:{positions:{},pan:{x:0,y:0},zoom:1}}};}
function member(value:LocalCapsule,id=randomUUID(),revision=1):MemberCapsule {const {dataset,title,note,language,entityIds,claimIds,document}=value;return {id,schemaVersion:2,revision,createdAt:value.createdAt,updatedAt:"2026-10-29T00:00:01Z",content:{dataset,title,note,language,entityIds,claimIds,document}};}
type RequestOptions={method?:string;user?:string;body?:{requestId:string;expectedRevision?:number;content:MemberCapsule["content"]}};
const writes=()=>mocks.api.mock.calls.filter(([, ,options])=>options?.method==='POST'||options?.method==='PUT');
const title=(value:string)=>fireEvent.change(screen.getByLabelText("Draft title"),{target:{value}});
const save=()=>fireEvent.click(screen.getByRole("button",{name:"Save draft"}));
function setup(handler:(path:string,options:RequestOptions)=>unknown) {mocks.api.mockImplementation((path:string,_schema:unknown,options:RequestOptions={})=>path.endsWith("capsule-capabilities")?Promise.resolve({documents:true,community:true,storageBytes:0,totalBytes:64_000_000}):handler(path,options));}
beforeEach(()=>{vi.clearAllMocks();Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});mocks.identity={status:"checking",user:null,rechecking:false,error:false,version:0};mocks.browser.mockImplementation(async(value:LocalCapsule)=>value);mocks.refresh.mockResolvedValue(null);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

it("waits for identity resolution and saves a newly created graph in the authenticated account",async()=>{
  const initial=capsule();setup((_path,options)=>Promise.resolve({capsule:member({...initial,...options.body!.content}),replayed:false}));
  const view=render(<CapsuleWorkspace initial={initial} isNew/>);
  const early=screen.queryByRole("button",{name:"Save draft"});expect(!early||(early as HTMLButtonElement).disabled).toBe(true);expect(writes()).toHaveLength(0);
  authenticated();view.rerender(<CapsuleWorkspace initial={initial} isNew/>);
  await waitFor(()=>expect((screen.getByRole("button",{name:"Save draft"}) as HTMLButtonElement).disabled).toBe(false));save();
  await waitFor(()=>expect(writes()).toHaveLength(1));expect(writes()[0][2].user).toBe(a.id);expect(writes()[0][2].method).toBe("POST");expect(mocks.browser).not.toHaveBeenCalled();
});
it("accepts the same saved content when PostgreSQL reorders layout object keys",async()=>{
  authenticated();const initial=capsule(),second=randomUUID(),first=initial.document!.nodes[0].key;
  initial.document!.nodes.push({key:second,title:'Second node',description:'',badge:'',origin:{kind:'local'}});
  initial.document!.layout.positions={[first]:{x:10,y:20},[second]:{x:30,y:40}};
  const onSaved=vi.fn();
  setup((_path,options)=>{const content=structuredClone(options.body!.content);content.document!.layout.positions=Object.fromEntries(Object.entries(content.document!.layout.positions).reverse());return Promise.resolve({capsule:{...member(initial),content},replayed:false});});
  render(<CapsuleWorkspace initial={initial} isNew onSaved={onSaved}/>);save();
  await waitFor(()=>expect(screen.getByText('saved')).toBeTruthy());expect(onSaved).toHaveBeenCalledOnce();expect(writes()).toHaveLength(1);expect(mocks.browser).not.toHaveBeenCalled();
});
it("still rejects a saved result with a different document array order",async()=>{
  authenticated();const initial=capsule();initial.document!.nodes.push({key:randomUUID(),title:'Second node',description:'',badge:'',origin:{kind:'local'}});
  const onSaved=vi.fn();setup((_path,options)=>{const content=structuredClone(options.body!.content);content.document!.nodes.reverse();return Promise.resolve({capsule:{...member(initial),content},replayed:false});});
  render(<CapsuleWorkspace initial={initial} isNew onSaved={onSaved}/>);title('Retain my order');save();
  await screen.findByRole('alert');expect(screen.queryByText('saved')).toBeNull();expect(onSaved).not.toHaveBeenCalled();expect((screen.getByLabelText('Draft title') as HTMLInputElement).value).toBe('Retain my order');
});
it("loads the full member document before opening a summary item",async()=>{
  authenticated();const initial=capsule(),saved=member(initial);const content={...saved.content};delete content.document;
  setup(path=>Promise.resolve(path==='/api/member/capsules'?{capsules:[{...saved,content,hasDocument:true,published:false}]}:{capsule:saved}));
  render(<MyCapsules dataset="demo" onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Open'}));
  await waitFor(()=>expect(screen.getByTestId('document-nodes').textContent).toBe('1'));expect(mocks.api.mock.calls.some(([path])=>path===`/api/member/capsules/${saved.id}`)).toBe(true);expect(mocks.browser).not.toHaveBeenCalled();
});
it("finds favorite, link-shared and community-listed Capsules independently without exposing link capabilities",async()=>{
  authenticated();
  const capsules=[['Private study',false,false],['Link study',true,false],['Community study',false,true],['Both destinations',true,true]].map(([title,shared,published])=>{
    const saved=member({...capsule(),title:title as string}),content={...saved.content};delete content.document;
    return {...saved,content,hasDocument:true,shared,published};
  });
  const summary=memberListSchema.parse({capsules});expect(summary.capsules[1].shared).toBe(true);
  expect(memberListSchema.safeParse({capsules:[{...capsules[1],token:'not-a-list-field'}]}).success).toBe(false);
  for (let n=0;n<capsules.length;n++) vi.mocked(capsuleMetadata).mockImplementationOnce(async id=>({id,favorite:n===1,lastOpened:null}));
  setup(()=>Promise.resolve(summary));render(<MyCapsules dataset="demo" onClose={()=>{}}/>);
  await screen.findByRole('heading',{name:'Both destinations'});
  const row=(title:string)=>screen.getByRole('heading',{name:title}).closest('li')!;
  expect(within(row('Private study')).queryByText('Link shared')).toBeNull();
  expect(within(row('Link study')).getByText('Link shared')).toBeTruthy();expect(within(row('Link study')).queryByText('Listed in a community')).toBeNull();
  expect(within(row('Community study')).getByText('Listed in a community')).toBeTruthy();expect(within(row('Community study')).queryByText('Link shared')).toBeNull();
  expect(within(row('Both destinations')).getByText('Link shared')).toBeTruthy();expect(within(row('Both destinations')).getByText('Listed in a community')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Shared links'}));expect(screen.getAllByRole('listitem')).toHaveLength(2);expect(screen.queryByRole('heading',{name:'Community study'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Community'}));expect(screen.getAllByRole('listitem')).toHaveLength(2);expect(screen.queryByRole('heading',{name:'Link study'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Favorites'}));expect(screen.getAllByRole('listitem')).toHaveLength(1);expect(screen.getByRole('heading',{name:'Link study'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Recent'}));expect(screen.getAllByRole('listitem')).toHaveLength(4);
});
it("uses the same workspace surface for graph creation and reopening from My Capsules",async()=>{
  authenticated();const initial=capsule(),saved=member(initial),content={...saved.content};delete content.document;
  setup(path=>Promise.resolve(path==='/api/member/capsules'?{capsules:[{...saved,content,hasDocument:true,published:false}]}:{capsule:saved}));
  const creation=render(<CapsuleWorkspace initial={initial} isNew/>);
  const surface=screen.getByRole('dialog',{name:'Capsule'}).className;expect(surface).toBeTruthy();creation.unmount();
  render(<MyCapsules dataset="demo" onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Open'}));
  await waitFor(()=>expect(screen.getByRole('dialog',{name:'Capsule'}).className).toBe(surface));
  expect(screen.queryByRole('dialog',{name:'My Capsules'})).toBeNull();expect(screen.getByLabelText('Draft title')).toBeTruthy();
});
it("never falls back to browser storage while a known member document is awaiting identity confirmation",async()=>{
  const initial=capsule(),saved=member(initial);setup(()=>Promise.resolve({capsule:saved}));
  const view=render(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id}/>);
  expect(screen.getByText('locked')).toBeTruthy();expect(screen.queryByLabelText('Draft title')).toBeNull();expect(mocks.browser).not.toHaveBeenCalled();
  authenticated(b);view.rerender(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id}/>);
  expect(screen.getByText('locked')).toBeTruthy();expect(screen.queryByLabelText('Draft title')).toBeNull();expect(writes()).toHaveLength(0);expect(mocks.browser).not.toHaveBeenCalled();
});
it("withholds a late full-document response after a different account becomes current",async()=>{
  authenticated();const initial=capsule(),saved=member(initial),content={...saved.content};delete content.document;let finish!:(value:unknown)=>void;
  setup(path=>path==='/api/member/capsules'?Promise.resolve({capsules:mocks.identity.user?.id===a.id?[{...saved,content,hasDocument:true}]:[]}):new Promise(resolve=>{finish=resolve;}));
  const view=render(<MyCapsules dataset="demo" onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Open'}));
  await waitFor(()=>expect(mocks.api.mock.calls.some(([path])=>path===`/api/member/capsules/${saved.id}`)).toBe(true));
  authenticated(b);view.rerender(<MyCapsules dataset="demo" onClose={()=>{}}/>);
  await act(async()=>{finish({capsule:saved});});
  expect(screen.queryByLabelText('Draft title')).toBeNull();expect(mocks.browser).not.toHaveBeenCalled();
});
it("retains the draft and suppresses late success when the account changes during a save",async()=>{
  authenticated();const initial=capsule(),saved=member(initial),onSaved=vi.fn();let finish!:(result:unknown)=>void;
  setup(()=>new Promise(resolve=>{finish=resolve;}));
  const view=render(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id} onSaved={onSaved}/>);
  title("A private edited draft");save();await waitFor(()=>expect(writes()).toHaveLength(1));
  authenticated(b);view.rerender(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id} onSaved={onSaved}/>);
  await act(async()=>{finish({capsule:{...saved,revision:2,content:{...saved.content,title:"A private edited draft"}},replayed:false,appliedRevision:2});});
  expect(onSaved).not.toHaveBeenCalled();expect(mocks.browser).not.toHaveBeenCalled();expect(screen.queryByText("saved")).toBeNull();
  authenticated();view.rerender(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id} onSaved={onSaved}/>);
  expect((screen.getByLabelText("Draft title") as HTMLInputElement).value).toBe("A private edited draft");expect(writes()[0][2].user).toBe(a.id);
});
it("resolves an unknown create with the original request before saving later edits to the same Capsule",async()=>{
  authenticated();const initial=capsule(),id=randomUUID();let post=0;
  setup((path,options)=>{const content=options.body!.content;if(options.method==='POST'){post++;if(post===1)return Promise.reject(new TypeError("lost response"));return Promise.resolve({capsule:{...member(initial,id),content},replayed:true});}return Promise.resolve({capsule:{...member(initial,id,2),content},replayed:false,appliedRevision:2});});
  render(<CapsuleWorkspace initial={initial} isNew/>);title("First submitted draft");save();await screen.findByRole("alert");
  title("Later edited draft");save();await waitFor(()=>expect(screen.getByText("saved")).toBeTruthy());
  const sent=writes();expect(sent).toHaveLength(3);expect(sent[0][2].body).toEqual(sent[1][2].body);expect(sent[0][2].body.content.title).toBe("First submitted draft");
  expect(sent[2][0]).toBe(`/api/member/capsules/${id}`);expect(sent[2][2]).toMatchObject({method:"PUT",user:a.id,body:{expectedRevision:1,content:{title:"Later edited draft"}}});expect(mocks.browser).not.toHaveBeenCalled();
});
it("keeps later edits when replay reveals a different current create result",async()=>{
  authenticated();const initial=capsule(),saved=member(initial),onSaved=vi.fn();let count=0;
  setup(()=>{if(++count===1)return Promise.reject(new TypeError("lost response"));return Promise.resolve({capsule:{...saved,revision:2,content:{...saved.content,title:"A different client changed this"}},replayed:true});});
  render(<CapsuleWorkspace initial={initial} isNew onSaved={onSaved}/>);title("My submitted draft");save();await screen.findByRole("alert");title("My later unsaved edit");save();
  await waitFor(()=>expect(writes()).toHaveLength(2));await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());
  expect((screen.getByLabelText("Draft title") as HTMLInputElement).value).toBe("My later unsaved edit");expect(onSaved).not.toHaveBeenCalled();expect(screen.queryByText("saved")).toBeNull();expect(mocks.browser).not.toHaveBeenCalled();
});
it("uses a distinct create request only for an explicitly requested copy after an unknown save",async()=>{
  authenticated();const initial=capsule();let count=0;
  setup((_path,options)=>{if(++count===1)return Promise.reject(new TypeError("lost response"));return Promise.resolve({capsule:{...member(initial),content:options.body!.content},replayed:false});});
  render(<CapsuleWorkspace initial={initial} isNew/>);title("A possible first save");save();await screen.findByRole("alert");title("Explicit additional copy");fireEvent.click(screen.getByRole("button",{name:"Save copy"}));
  await waitFor(()=>expect(screen.getByText("saved")).toBeTruthy());const sent=writes();expect(sent).toHaveLength(2);expect(sent[0][2].body.requestId).not.toBe(sent[1][2].body.requestId);expect(sent[1][2].body.content.title).toBe("Explicit additional copy");expect(mocks.browser).not.toHaveBeenCalled();
});

it("keeps the canvas and focused draft mounted across tab return, pending verification and network failure",async()=>{
  authenticated();const initial=capsule(),saved=member(initial);setup(()=>Promise.resolve({capsule:saved}));
  const hidden=vi.spyOn(document,"hidden","get").mockReturnValue(false);
  let verify!:(value:typeof a|null)=>void;mocks.refresh.mockImplementation(()=>new Promise(resolve=>{verify=resolve;}));
  const view=render(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id}/>);title("Retained private draft");
  const canvas=screen.getByTestId('canvas'),input=screen.getByLabelText('Draft title');input.focus();
  hidden.mockReturnValue(true);fireEvent(document,new Event("visibilitychange"));
  expect(screen.queryByText("locked")).toBeNull();expect(screen.getByTestId('canvas')).toBe(canvas);
  hidden.mockReturnValue(false);fireEvent(document,new Event("visibilitychange"));
  expect(screen.queryByText("locked")).toBeNull();expect(mocks.refresh).toHaveBeenCalledWith(true);
  mocks.identity={...mocks.identity,rechecking:true};view.rerender(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id}/>);
  expect(screen.getByTestId('canvas')).toBe(canvas);expect(document.activeElement).toBe(input);
  await act(async()=>{verify(a);});
  mocks.identity={...mocks.identity,rechecking:false,error:true};view.rerender(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id}/>);
  expect(screen.getByTestId('canvas')).toBe(canvas);expect(document.activeElement).toBe(input);expect((input as HTMLInputElement).value).toBe("Retained private draft");expect(writes()).toHaveLength(0);
});

it("keeps list titles during background confirmation and hides them immediately on actual logout",async()=>{
  authenticated();const saved=member(capsule()),content={...saved.content};delete content.document;
  setup(()=>Promise.resolve({capsules:[{...saved,content,hasDocument:true}]}));
  const hidden=vi.spyOn(document,"hidden","get").mockReturnValue(false);
  let verify!:(value:null)=>void;mocks.refresh.mockImplementation(()=>new Promise(resolve=>{verify=resolve;}));
  const view=render(<MyCapsules dataset="demo" onClose={()=>{}}/>);await screen.findByText("Original draft");
  const row=screen.getByText("Original draft");
  hidden.mockReturnValue(true);fireEvent(document,new Event("visibilitychange"));expect(screen.getByText("Original draft")).toBe(row);
  hidden.mockReturnValue(false);fireEvent(document,new Event("visibilitychange"));expect(screen.getByText("Original draft")).toBe(row);
  mocks.identity={...mocks.identity,rechecking:true};view.rerender(<MyCapsules dataset="demo" onClose={()=>{}}/>);expect(screen.getByText("Original draft")).toBe(row);
  mocks.identity={status:"guest",user:null,rechecking:false,error:false,version:2};
  await act(async()=>{verify(null);view.rerender(<MyCapsules dataset="demo" onClose={()=>{}}/>);});
  expect(screen.queryByText("Original draft")).toBeNull();expect(writes()).toHaveLength(0);
});

it("accepts an authorized save while background identity confirmation is pending",async()=>{
  authenticated();const initial=capsule(),saved=member(initial),onSaved=vi.fn();let finish!:(result:unknown)=>void;
  setup(()=>new Promise(resolve=>{finish=resolve;}));
  const view=render(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id} onSaved={onSaved}/>);title("Save without interruption");save();
  mocks.identity={...mocks.identity,rechecking:true};view.rerender(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id} onSaved={onSaved}/>);
  await act(async()=>{finish({capsule:{...saved,revision:2,content:{...saved.content,title:"Save without interruption"}},appliedRevision:2});});
  expect(onSaved).toHaveBeenCalledOnce();expect(screen.getByText("saved")).toBeTruthy();
});

it("rejects an old save response after logout and re-login to the same account, even before React rerenders",async()=>{
  authenticated();const initial=capsule(),saved=member(initial),onSaved=vi.fn();let finish!:(result:unknown)=>void;
  setup(()=>new Promise(resolve=>{finish=resolve;}));
  render(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id} onSaved={onSaved}/>);title("Retained across login");save();
  // Same owner id, but the auth event started a different session generation.
  authenticated();
  await act(async()=>{finish({capsule:{...saved,revision:2,content:{...saved.content,title:"Retained across login"}},appliedRevision:2});});
  expect(onSaved).not.toHaveBeenCalled();expect(screen.queryByText("saved")).toBeNull();expect((screen.getByLabelText('Draft title') as HTMLInputElement).value).toBe("Retained across login");
});

it("never delivers a save result to a closed editor",async()=>{
  authenticated();const initial=capsule(),saved=member(initial),onSaved=vi.fn();let finish!:(result:unknown)=>void;
  setup(()=>new Promise(resolve=>{finish=resolve;}));
  const view=render(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id} onSaved={onSaved}/>);save();view.unmount();
  await act(async()=>{finish({capsule:saved});});expect(onSaved).not.toHaveBeenCalled();
});

it("conceals a private draft on confirmed logout and restores only for the original owner",async()=>{
  authenticated();const initial=capsule(),saved=member(initial);setup(()=>Promise.resolve({capsule:saved}));
  const view=render(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id}/>);title("Original owner's draft");
  mocks.identity={status:'guest',user:null,rechecking:false,error:false,version:mocks.identity.version+1};view.rerender(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id}/>);
  expect(screen.queryByLabelText('Draft title')).toBeNull();expect(screen.queryByTestId('canvas')).toBeNull();
  authenticated(b);view.rerender(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id}/>);expect(screen.queryByLabelText('Draft title')).toBeNull();
  authenticated();view.rerender(<CapsuleWorkspace initial={initial} member={saved} ownerId={a.id}/>);expect((screen.getByLabelText('Draft title') as HTMLInputElement).value).toBe("Original owner's draft");
});
