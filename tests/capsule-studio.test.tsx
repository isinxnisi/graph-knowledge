// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import type GraphCanvas from "../components/GraphCanvas";
import type { GraphView } from "../lib/client/graph-view";
import type { LocalCapsule } from "../lib/client/local-capsules";
import { captureCapsule } from "../lib/client/capsule-editor";
import { emptyGraph } from "../lib/client/graph-state";
import type { NeighborsResponse } from "../lib/domain/api";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import CapsuleSurface, { CapsuleModal } from "../components/CapsuleSurface";
import { useDiscussionDraft } from "../components/CapsuleDiscussion";
import CapsuleStudio from "../components/CapsuleStudio";
import CapsuleContextMenu from "../components/CapsuleContextMenu";

type CanvasProps = ComponentProps<typeof GraphCanvas>;
const mocks = vi.hoisted(() => ({ canvas: null as CanvasProps | null, view: null as GraphView | null, search: vi.fn(), neighbors:vi.fn(), focus: vi.fn() }));
vi.mock("../lib/client/ui-locale", () => ({ useUiLocale: () => ({ locale: "en" }) }));
vi.mock("../lib/client/api", async () => ({ ...await vi.importActual("../lib/client/api"), searchEntities: mocks.search, fetchNeighbors:mocks.neighbors }));
// This double exposes the real canvas contract. Renderer geometry has its own
// Cytoscape tests; these tests exercise the mounted editor and actual dialogs.
vi.mock("../components/GraphCanvas", async () => {
  const { useEffect, useImperativeHandle } = await import("react");
  return { default: function Canvas(props: CanvasProps) {
    mocks.canvas = props;
    useImperativeHandle(props.ref, () => ({ capture: () => mocks.view && structuredClone(mocks.view), focusEntity: mocks.focus, ensureVisible: mocks.focus, focus: mocks.focus }), []);
    useEffect(() => {
      if (props.restoration) mocks.view = structuredClone(props.restoration.view);
      props.onViewChange?.();
      // Cytoscape applies a restoration only when its graph generation changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.graph.generation]);
    return <div data-testid="canvas" tabIndex={0}>{props.content?.nodes.map(node => <span key={node.id}>{node.label}</span>)}{props.footerAction}</div>;
  }};
});

const a="10000000-0000-4000-8000-000000000001", b="10000000-0000-4000-8000-000000000002", relation="20000000-0000-4000-8000-000000000001", evidence="30000000-0000-4000-8000-000000000001";
function capsule(): LocalCapsule {
  return { id:"40000000-0000-4000-8000-000000000001",dataset:"demo",revision:1,title:"My graph",note:"",language:"ja",createdAt:"2026-10-30T00:00:00Z",entityIds:[],claimIds:[],document:{schemaVersion:1,
    nodes:[{key:a,title:"First entity",description:"",badge:"Idea",origin:{kind:"local"}},{key:b,title:"Second entity",description:"",badge:"",origin:{kind:"local"}}],
    relations:[{key:relation,source:a,target:b,label:"Inspired",note:"",origin:{kind:"local"}}],texts:[],
    evidence:[{key:evidence,targetKey:a,title:"Original source",url:null,locator:"p. 1",note:"A source note",supports:"description",stance:"background"}],unresolvedClaimIds:[],
    layout:{positions:{[a]:{x:0,y:0},[b]:{x:200,y:60}},pan:{x:500,y:300},zoom:1,center:{x:0,y:0},viewport:{width:1000,height:600}}}};
}
function groupedCapsule(): LocalCapsule {
  const page=examples.neighbors as NeighborsResponse, first=page.claims[0], second={...first,id:"20000000-0000-4000-8000-000000000002"};
  const graph={...emptyGraph(),nodes:Object.fromEntries(page.nodes.filter(n=>n.id===first.subjectId || n.id===first.objectId).map(n=>[n.id,n])),claims:{[first.id]:first,[second.id]:second}};
  const value=captureCapsule(graph,{positions:{[first.subjectId]:{x:0,y:0},[first.objectId]:{x:200,y:60}},pan:{x:500,y:300},zoom:1,center:{x:0,y:0},viewport:{width:1000,height:600},initialLayoutDone:true},"demo","Grouped claims");
  value.document!.relations[0].label="First claim";value.document!.relations[1].label="Second claim";
  return value;
}
const saveResult = async (value:LocalCapsule) => ({...value,revision:value.revision+1,updatedAt:"2026-10-30T01:00:00Z"});
const button = (name:string) => screen.getByRole("button",{name});
const click = (name:string) => fireEvent.click(button(name));
const change = (name:string,value:string) => fireEvent.change(screen.getByLabelText(name),{target:{value}});
const cancel = (element:Element) => fireEvent(element,new Event("cancel",{bubbles:false,cancelable:true}));
const unloadIsBlocked = () => { const event=new Event("beforeunload",{cancelable:true});act(()=>window.dispatchEvent(event));return event.defaultPrevented; };
function context(id:string|undefined,keys:string[]) { act(()=>mocks.canvas!.onContextMenu!({kind:id ? "node" : "background",id,selectedKeys:keys,clientX:400,clientY:240,position:{x:420,y:640},source:"pointer"})); }
function move(next:GraphView) { const previous=structuredClone(mocks.view!);act(()=>{mocks.view=structuredClone(next);mocks.canvas!.onMove?.(previous,next);mocks.canvas!.onViewChange?.();}); }
beforeEach(()=>{
  vi.clearAllMocks();mocks.canvas=null;mocks.view=null;
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;this.querySelector<HTMLElement>("[autofocus],button,input,textarea,select")?.focus();}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
  vi.spyOn(window.history,"pushState").mockImplementation(()=>{});vi.spyOn(window.history,"back").mockImplementation(()=>{});vi.spyOn(window.history,"forward").mockImplementation(()=>{});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

it("reverses a local arrow as one undoable edit and saves its new endpoints",async()=>{
  const save=vi.fn(saveResult);render(<CapsuleStudio capsule={capsule()} isNew onSave={save}/>);
  act(()=>mocks.canvas!.onRelationDoubleClick!(relation));click("Reverse direction");click("Apply");
  expect(mocks.canvas!.content!.relations[relation]).toMatchObject({subjectId:b,objectId:a});
  click("Undo");expect(mocks.canvas!.content!.relations[relation]).toMatchObject({subjectId:a,objectId:b});
  click("Redo");expect(mocks.canvas!.content!.relations[relation]).toMatchObject({subjectId:b,objectId:a});
  click("Save");await waitFor(()=>expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].document!.relations[0]).toMatchObject({source:b,target:a,origin:{kind:"local"}});
});

it("makes reciprocal local arrows without duplicating reverse evidence or an existing reverse relation",async()=>{
  const value=capsule();value.document!.evidence[0]={...value.document!.evidence[0],targetKey:relation,supports:"relation"};
  const save=vi.fn(saveResult);render(<CapsuleStudio capsule={value} isNew onSave={save}/>);
  act(()=>mocks.canvas!.onRelationDoubleClick!(relation));click("Add the reverse relation too");click("Apply");
  expect(Object.values(mocks.canvas!.content!.relations)).toHaveLength(2);
  click("Undo");expect(Object.values(mocks.canvas!.content!.relations)).toHaveLength(1);
  click("Redo");expect(Object.values(mocks.canvas!.content!.relations)).toHaveLength(2);
  act(()=>mocks.canvas!.onRelationDoubleClick!(relation));click("Add the reverse relation too");click("Apply");
  expect(Object.values(mocks.canvas!.content!.relations)).toHaveLength(2);
  click("Save");await waitFor(()=>expect(save).toHaveBeenCalledOnce());
  const saved=save.mock.calls[0][0].document!,reverse=saved.relations.find(r=>r.source===b && r.target===a)!;
  expect(reverse).toBeTruthy();expect(saved.evidence).toHaveLength(1);expect(saved.evidence[0].targetKey).toBe(relation);
  expect(saved.evidence.some(e=>e.targetKey===reverse.key)).toBe(false);
});

it("keeps a KG claim's direction fixed while exposing its endpoints",()=>{
  const value=groupedCapsule();render(<CapsuleStudio capsule={value} isNew onSave={saveResult}/>);
  act(()=>mocks.canvas!.onRelationDoubleClick!(Object.keys(mocks.canvas!.content!.relations)[0]));
  expect(screen.getByText(/This direction comes from the KG/)).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Reverse direction"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Add the reverse relation too"})).toBeNull();
});

it("does not offer direction changes for a self relation",()=>{
  const value=capsule();value.document!.relations[0].target=a;
  render(<CapsuleStudio capsule={value} isNew onSave={saveResult}/>);
  act(()=>mocks.canvas!.onRelationDoubleClick!(relation));
  expect(screen.queryByRole("button",{name:"Reverse direction"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Add the reverse relation too"})).toBeNull();
});

it("saves an authored entity shape, restores it in the form and undoes a shape change",async()=>{
  const save=vi.fn(saveResult);render(<CapsuleStudio capsule={capsule()} isNew onSave={save}/>);
  act(()=>mocks.canvas!.onEntityDoubleClick!(a));click("Diamond");click("Apply");
  expect(mocks.canvas!.content!.nodes.find(n=>n.id===a)).toMatchObject({shape:"diamond"});
  click("Undo");expect(mocks.canvas!.content!.nodes.find(n=>n.id===a)?.shape).toBeUndefined();
  click("Redo");act(()=>mocks.canvas!.onEntityDoubleClick!(a));
  expect(button("Diamond").getAttribute("aria-pressed")).toBe("true");click("Cancel");
  click("Save");await waitFor(()=>expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].document!.nodes[0]).toMatchObject({shape:"diamond",origin:{kind:"local"}});
});

it("can choose a custom entity shape and restore a KG entity's default without changing its snapshot",async()=>{
  const value=groupedCapsule(),savedSnapshot=structuredClone(value.document!.nodes[0].origin);
  value.document!.nodes[0].shape="circle";
  const save=vi.fn(saveResult);render(<CapsuleStudio capsule={value} isNew onSave={save}/>);
  act(()=>mocks.canvas!.onEntityDoubleClick!(value.document!.nodes[0].key));click("Default");click("Apply");
  click("Add custom entity");change("Title","A central idea");click("Circle");click("Add");
  click("Save");await waitFor(()=>expect(save).toHaveBeenCalledOnce());
  const nodes=save.mock.calls[0][0].document!.nodes;
  expect(nodes[0].shape).toBeUndefined();expect(nodes[0].origin).toEqual(savedSnapshot);
  expect(nodes.find(n=>n.title==="A central idea")).toMatchObject({shape:"circle",origin:{kind:"local"}});
});

it.each([
  ["Add custom entity","Title"],
  ["Add text","Text"],
  ["Description","Title"],
  ["Search the KG","Name or alias"],
])("focuses the editing field after opening %s and restores its trigger on Escape",(action,label)=>{
  render(<CapsuleStudio capsule={capsule()} isNew onSave={saveResult}/>);
  const trigger=button(action);trigger.focus();fireEvent.click(trigger);
  expect(document.activeElement).toBe(screen.getByLabelText(label));
  cancel(screen.getByRole("dialog"));expect(document.activeElement).toBe(trigger);
});

it("focuses source and relation fields after opening directly, then returns to the invoking control",()=>{
  render(<CapsuleStudio capsule={capsule()} isNew onSave={saveResult}/>);act(()=>mocks.canvas!.onEntity(a));click("Details & evidence");
  const evidenceButton=button("Edit evidence");evidenceButton.focus();fireEvent.click(evidenceButton);expect(document.activeElement).toBe(screen.getByLabelText("Source title"));
  click("Cancel");expect(document.activeElement).toBe(evidenceButton);
  const graph=screen.getByTestId("canvas");graph.focus();act(()=>mocks.canvas!.onRelationDoubleClick!(relation));expect(document.activeElement).toBe(screen.getByLabelText("Label on the graph"));
  cancel(screen.getByRole("dialog"));expect(document.activeElement).toBe(graph);
});

it("initially focuses Keep editing in discard confirmation and restores the discard trigger",()=>{
  render(<CapsuleStudio capsule={capsule()} isNew onSave={saveResult}/>);const trigger=button("Discard");trigger.focus();fireEvent.click(trigger);
  expect(document.activeElement).toBe(button("Keep editing"));cancel(screen.getByRole("dialog",{name:"Discard your changes?"}));expect(document.activeElement).toBe(trigger);
});

it("keeps a programmatic view restoration clean and preserves viewing layout through sharing",()=>{
  render(<CapsuleStudio capsule={capsule()} onSave={saveResult} sharing={<p>Saved sharing controls</p>}/>);
  const viewing={...mocks.view!,pan:{x:170,y:280},center:{x:220,y:30},zoom:1.5};mocks.view=structuredClone(viewing);
  click("Share");expect(screen.getByRole("dialog",{name:"Share Capsule"})).toBeTruthy();click("Close sharing");expect(mocks.view).toEqual(viewing);
  click("Edit");expect(screen.queryByText("Unsaved")).toBeTruthy(); // Viewing changes are now an explicit draft.
  click("Discard");expect(screen.queryByRole("dialog",{name:"Discard your changes?"})).toBeNull();expect(mocks.view).toEqual(viewing);
});

it("does not make an unchanged saved view dirty when only its viewport and pixel pan change",()=>{
  render(<CapsuleStudio capsule={capsule()} onSave={saveResult}/>);
  mocks.view={...mocks.view!,pan:{x:300,y:200},viewport:{width:600,height:400}};
  click("Edit");expect(screen.queryByText("Unsaved")).toBeNull();expect(unloadIsBlocked()).toBe(false);
  click("Discard");expect(screen.queryByRole("dialog",{name:"Discard your changes?"})).toBeNull();expect(button("Edit")).toBeTruthy();
});

it("keeps save-to-edit clean after harmless capture rounding and a reordered position map",()=>{
  render(<CapsuleStudio capsule={capsule()} onSave={saveResult}/>);
  mocks.view={...mocks.view!,positions:{[b]:{x:200+1e-10,y:60},[a]:{x:1e-12,y:0}},zoom:1+1e-14,center:{x:1e-12,y:-1e-12}};
  click("Edit");expect(screen.queryByText("Unsaved")).toBeNull();expect(unloadIsBlocked()).toBe(false);
  click("Discard");expect(screen.queryByRole("dialog",{name:"Discard your changes?"})).toBeNull();
});

it("protects unapplied editor input from page unload and clears that protection when the form is cancelled",()=>{
  render(<CapsuleStudio capsule={capsule()} onSave={saveResult}/>);click("Edit");act(()=>mocks.canvas!.onEntityDoubleClick!(a));
  expect(unloadIsBlocked()).toBe(false);change("Title","Still typing, not yet applied");expect(unloadIsBlocked()).toBe(true);
  click("Cancel");expect(unloadIsBlocked()).toBe(false);expect(mocks.canvas!.content!.nodes[0].label).toBe("First entity");
});

it("applies title locally, preserves IME composition, and cancels title Escape before workspace Escape",()=>{
  const onSave=vi.fn(saveResult),onClose=vi.fn();render(<CapsuleStudio capsule={capsule()} isNew onSave={onSave} onClose={onClose}/>);
  click("My graph");const input=screen.getByLabelText("Capsule title");change("Capsule title","日本語の草稿");
  fireEvent.compositionStart(input);fireEvent.keyDown(input,{key:"Enter",isComposing:true,keyCode:229});fireEvent.keyDown(input,{key:"Escape",isComposing:true});
  expect(screen.getByLabelText("Capsule title")).toBe(input);expect(onSave).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);fireEvent.keyDown(input,{key:"Escape"});expect(screen.queryByLabelText("Capsule title")).toBeNull();expect(button("My graph")).toBeTruthy();
  click("My graph");change("Capsule title","A deliberate title");fireEvent.keyDown(screen.getByLabelText("Capsule title"),{key:"Enter"});
  expect(button("A deliberate title")).toBeTruthy();expect(onSave).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByTestId("canvas"),{key:"Escape"});const confirmation=screen.getByRole("dialog",{name:"Discard your changes?"});expect(confirmation.textContent).toContain("original graph");
  cancel(confirmation);expect(screen.queryByRole("dialog",{name:"Discard your changes?"})).toBeNull();expect(onClose).not.toHaveBeenCalled();
});

it("restores pre-edit viewing positions, camera and multi-selection after one-step move undo/redo and discard",()=>{
  const initial=capsule();render(<CapsuleStudio capsule={initial} onSave={saveResult}/>);
  const viewing={...mocks.view!,positions:{[a]:{x:110,y:70},[b]:{x:330,y:190}},center:{x:80,y:40},pan:{x:380,y:240},zoom:1.5};mocks.view=structuredClone(viewing);
  act(()=>{mocks.canvas!.onSelectionChange!([a,b]);mocks.canvas!.onEntity(a);});click("Edit");
  const edited={...viewing,positions:{[a]:{x:160,y:100},[b]:{x:380,y:220}}};move(edited);
  click("Undo");expect(mocks.view!.positions).toEqual(viewing.positions);click("Redo");expect(mocks.view!.positions).toEqual(edited.positions);
  click("Discard");click("Discard changes");expect(mocks.view).toEqual(viewing);expect(mocks.canvas!.selectedKeys).toEqual([a,b]);expect(button("Edit")).toBeTruthy();expect(initial.document!.layout.positions[a]).toEqual({x:0,y:0});
});

it("right-clicking a selected group preserves it and removes connected relations/evidence in one undoable action",async()=>{
  const onSave=vi.fn(saveResult);render(<CapsuleStudio capsule={capsule()} isNew onSave={onSave}/>);context(a,[a,b]);
  expect(mocks.canvas!.selectedKeys).toEqual([a,b]);expect(screen.queryByRole("menuitem",{name:"Edit"})).toBeNull();
  fireEvent.click(screen.getByRole("menuitem",{name:"Remove 2 elements"}));expect(mocks.canvas!.content!.nodes).toHaveLength(0);
  click("Undo");expect(mocks.canvas!.content!.nodes).toHaveLength(2);click("Redo");click("Save");await waitFor(()=>expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.calls[0][0].document).toMatchObject({nodes:[],relations:[],evidence:[]});
});

it("edits an entity and its evidence directly from the graph without requiring the inspector",async()=>{
  const onSave=vi.fn(saveResult);render(<CapsuleStudio capsule={capsule()} isNew onSave={onSave}/>);
  act(()=>mocks.canvas!.onEntityDoubleClick!(a));expect(screen.getByRole("heading",{name:"Edit entity"})).toBeTruthy();
  expect(within(screen.getByLabelText("About")).queryByRole("option",{name:"Relation"})).toBeNull();
  change("Title","A revised entity");change("Category badge","Commentary");change("Source title","Revised source");change("What this source tells us","New evidence note");click("Apply");
  expect(mocks.canvas!.content!.nodes[0]).toMatchObject({label:"A revised entity",badge:"Commentary"});expect(onSave).not.toHaveBeenCalled();click("Save");
  await waitFor(()=>expect(onSave).toHaveBeenCalledOnce());expect(onSave.mock.calls[0][0].document!.evidence[0]).toMatchObject({key:evidence,targetKey:a,title:"Revised source",note:"New evidence note"});
});

it("offers compatible evidence categories for a relation and retains its source after saving",async()=>{
  const onSave=vi.fn(saveResult);render(<CapsuleStudio capsule={capsule()} isNew onSave={onSave}/>);
  act(()=>mocks.canvas!.onRelationDoubleClick!(relation));click("Add a source");
  const category=screen.queryByLabelText("About");
  if(category) expect(within(category).getAllByRole("option").map(option=>(option as HTMLOptionElement).value)).toEqual(["relation"]);
  change("Source title","Relationship source");change("What this source tells us","The relation is supported here.");click("Apply");click("Save");
  await waitFor(()=>expect(onSave).toHaveBeenCalledOnce());expect(onSave.mock.calls[0][0].document!.evidence).toEqual(expect.arrayContaining([expect.objectContaining({targetKey:relation,supports:"relation",title:"Relationship source"})]));
});

it("retains and protects every unapplied Claim draft while switching a grouped line, then applies them together",async()=>{
  const value=groupedCapsule(),onSave=vi.fn(saveResult),[first,second]=value.document!.relations;
  render(<CapsuleStudio capsule={value} onSave={onSave}/>);click("Edit");
  const id=Object.keys(mocks.canvas!.content!.relations)[0];act(()=>mocks.canvas!.onRelation(id));act(()=>mocks.canvas!.onRelationDoubleClick!(id));
  const choices="2 individual relations on this line";
  change(choices,second.key);expect(unloadIsBlocked()).toBe(false);change("Label on the graph","Second edited");
  change(choices,first.key);expect(unloadIsBlocked()).toBe(true);expect((screen.getByLabelText("Label on the graph") as HTMLInputElement).value).toBe("First claim");
  change("Label on the graph","First edited");change(choices,second.key);expect((screen.getByLabelText("Label on the graph") as HTMLInputElement).value).toBe("Second edited");
  click("Add a source");change("Source title","Second claim source");change(choices,first.key);click("Apply");click("Save");
  await waitFor(()=>expect(onSave).toHaveBeenCalledOnce());const saved=onSave.mock.calls[0][0].document!;
  expect(saved.relations.map(r=>r.label)).toEqual(["First edited","Second edited"]);expect(saved.evidence).toEqual([expect.objectContaining({targetKey:second.key,title:"Second claim source",supports:"relation"})]);
});

it("cancelling a grouped Claim form discards all its unapplied drafts without altering the graph",()=>{
  const value=groupedCapsule(),[first,second]=value.document!.relations;render(<CapsuleStudio capsule={value} onSave={saveResult}/>);click("Edit");
  const id=Object.keys(mocks.canvas!.content!.relations)[0];act(()=>mocks.canvas!.onRelation(id));act(()=>mocks.canvas!.onRelationDoubleClick!(id));
  change("Label on the graph","Do not apply first");change("2 individual relations on this line",second.key);change("Label on the graph","Do not apply second");click("Cancel");expect(unloadIsBlocked()).toBe(false);
  act(()=>mocks.canvas!.onRelationDoubleClick!(id));expect((screen.getByLabelText("Label on the graph") as HTMLInputElement).value).toBe(first.label);change("2 individual relations on this line",second.key);expect((screen.getByLabelText("Label on the graph") as HTMLInputElement).value).toBe(second.label);
});

it("does not expose the Claim switcher inside a source form or mark an unchanged source dirty",()=>{
  const view=render(<CapsuleStudio capsule={capsule()} onSave={saveResult}/>);click("Edit");act(()=>mocks.canvas!.onEntity(a));click("Details & evidence");click("Edit evidence");
  expect(unloadIsBlocked()).toBe(false);change("Source title","A source draft");expect(unloadIsBlocked()).toBe(true);click("Cancel");expect(unloadIsBlocked()).toBe(false);view.unmount();
  render(<CapsuleStudio capsule={groupedCapsule()} onSave={saveResult}/>);click("Edit");const id=Object.keys(mocks.canvas!.content!.relations)[0];act(()=>mocks.canvas!.onRelation(id));click("Details & evidence");click("Add evidence");
  expect(screen.queryByLabelText("2 individual relations on this line")).toBeNull();change("Source title","Evidence for the displayed line");expect(screen.getByRole("heading",{name:"Edit evidence"})).toBeTruthy();expect(unloadIsBlocked()).toBe(true);
});

it("keeps text formatting and insertion position when applying, saving and reopening the direct editor",async()=>{
  const onSave=vi.fn(saveResult);render(<CapsuleStudio capsule={capsule()} isNew onSave={onSave}/>);context(undefined,[]);fireEvent.click(screen.getByRole("menuitem",{name:"Add text"}));
  change("Text","A heading\nA longer annotation with an explicit line break.");change("Text width","410");change("Font size","22");click("Bold");change("Alignment","right");click("Add");
  expect(onSave).not.toHaveBeenCalled();const text=mocks.canvas!.content!.nodes.find(n=>n.kind==="text")!;expect(text.textFormat).toEqual({width:410,fontSize:22,fontWeight:"bold",align:"right"});
  act(()=>mocks.canvas!.onEntityDoubleClick!(text.id));expect((screen.getByLabelText("Text width") as HTMLInputElement).value).toBe("410");expect((screen.getByLabelText("Alignment") as HTMLSelectElement).value).toBe("right");click("Cancel");click("Save");
  await waitFor(()=>expect(onSave).toHaveBeenCalledOnce());const document=onSave.mock.calls[0][0].document!;expect(document.texts[0]).toMatchObject({width:410,fontSize:22,fontWeight:"bold",align:"right",text:"A heading\nA longer annotation with an explicit line break."});expect(document.layout.positions[text.id]).toEqual({x:420,y:640});
});

it("closing a search cancels its pending result before another search session opens",async()=>{
  let resolve!:(value:unknown)=>void;mocks.search.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  render(<CapsuleStudio capsule={capsule()} isNew onSave={saveResult}/>);click("Search the KG");change("Name or alias","first request");click("Search");
  await waitFor(()=>expect(mocks.search).toHaveBeenCalledOnce());const signal=mocks.search.mock.calls[0][1] as AbortSignal;click("Close search");expect(signal.aborted).toBe(true);click("Search the KG");
  await act(async()=>{resolve({items:[]});});expect(screen.queryByText("No entities found. Try another name.")).toBeNull();expect(screen.getByRole("dialog",{name:"Add from KG"})).toBeTruthy();
});

it("closing the neighbors dialog cancels pagination so a late page cannot reopen it",async()=>{
  const value=groupedCapsule(),node=value.document!.relations[0].source;
  const page={...examples.neighbors,centerId:node,claims:[examples.neighbors.claims[0]],page:{hasMore:true,nextCursor:"next-page"}} as NeighborsResponse;
  let resolve!:(value:NeighborsResponse)=>void;mocks.neighbors.mockResolvedValueOnce(page).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  render(<CapsuleStudio capsule={value} onSave={saveResult}/>);click("Edit");act(()=>mocks.canvas!.onEntity(node));click("Details & evidence");click("Add related KG entities");
  await screen.findByRole("dialog",{name:"KG neighbors"});click("More neighbors");await waitFor(()=>expect(mocks.neighbors).toHaveBeenCalledTimes(2));
  const signal=mocks.neighbors.mock.calls[1][2] as AbortSignal;click("Close neighbors");expect(signal.aborted).toBe(true);
  await act(async()=>{resolve(page);});expect(screen.queryByRole("dialog",{name:"KG neighbors"})).toBeNull();expect(button("Save").hasAttribute("disabled")).toBe(false);
});

it("retains the exact title and content after a failed save and retries only explicitly",async()=>{
  const onSave=vi.fn().mockRejectedValueOnce(new Error("Connection lost; draft retained")).mockImplementation(saveResult);
  render(<CapsuleStudio capsule={capsule()} isNew onSave={onSave}/>);click("My graph");change("Capsule title","Retained draft");click("Apply title");click("Save");
  await screen.findByRole("alert");expect(button("Retained draft")).toBeTruthy();expect(mocks.canvas!.content!.nodes).toHaveLength(2);expect(onSave).toHaveBeenCalledOnce();click("Save");
  await waitFor(()=>expect(onSave).toHaveBeenCalledTimes(2));expect(onSave.mock.calls[1][0]).toEqual(onSave.mock.calls[0][0]);
});

it("blocks graph and form edits during a pending save so its response cannot erase newer input",async()=>{
  let resolve!:(value:LocalCapsule)=>void;const onSave=vi.fn((value:LocalCapsule)=>new Promise<LocalCapsule>(done=>{resolve=()=>done(value);}));
  render(<CapsuleStudio capsule={capsule()} isNew onSave={onSave}/>);click("Save");
  expect(mocks.canvas!.interactionBlocked || screen.getByTestId("canvas").closest("[inert]") !== null).toBe(true);
  expect((button("Description") as HTMLButtonElement).disabled || button("Description").closest("[inert]") !== null).toBe(true);
  await act(async()=>{resolve(capsule());});
});

it("keeps the inner editor open during IME cancellation, then Escape closes only that dialog",()=>{
  const onClose=vi.fn();render(<CapsuleStudio capsule={capsule()} isNew onSave={saveResult} onClose={onClose}/>);click("Add custom entity");
  const dialog=screen.getByRole("dialog",{name:"Edit Capsule content"}),input=within(dialog).getByLabelText("Title");fireEvent.compositionStart(input);cancel(dialog);expect(screen.getByRole("dialog",{name:"Edit Capsule content"})).toBe(dialog);
  fireEvent.compositionEnd(input);cancel(dialog);expect(screen.queryByRole("dialog",{name:"Edit Capsule content"})).toBeNull();expect(onClose).not.toHaveBeenCalled();
});

it("context menus stay on-screen and support keyboard navigation without focusing disabled actions",()=>{
  const origin=document.createElement("button");document.body.append(origin);origin.focus();const onClose=vi.fn();
  const measure=vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(()=>({x:0,y:0,left:0,top:0,right:240,bottom:180,width:240,height:180,toJSON:()=>({})}));
  const view=render(<CapsuleContextMenu x={window.innerWidth-2} y={window.innerHeight-2} title="Actions" onClose={onClose} actions={[{label:"Edit",icon:"edit",action:()=>{}},{label:"Unavailable",icon:"plus",action:()=>{},disabled:true},{label:"Remove",icon:"minus",action:()=>{}}]}/>);
  const menu=screen.getByRole("menu");expect(Number.parseFloat(menu.style.left)+240).toBeLessThanOrEqual(window.innerWidth-8);expect(Number.parseFloat(menu.style.top)+180).toBeLessThanOrEqual(window.innerHeight-8);expect(document.activeElement).toBe(screen.getByRole("menuitem",{name:"Edit"}));
  fireEvent.keyDown(menu,{key:"ArrowDown"});expect(document.activeElement).toBe(screen.getByRole("menuitem",{name:"Remove"}));fireEvent.keyDown(menu,{key:"Escape"});expect(onClose).toHaveBeenCalledOnce();view.unmount();expect(document.activeElement).toBe(origin);origin.remove();measure.mockRestore();
});


function point(dialog: HTMLElement, type: "pointerdown" | "pointerup" | "pointercancel", x = 20, y = 20, pointerId = 1, button = 0) {
  const event = new Event(type, { bubbles:true, cancelable:true });
  Object.assign(event, { clientX:x, clientY:y, pointerId, button, isPrimary:true });
  fireEvent(dialog,event);
}
function bounds(dialog: HTMLElement) {
  vi.spyOn(dialog,"getBoundingClientRect").mockReturnValue({x:100,y:100,left:100,top:100,right:600,bottom:500,width:500,height:400,toJSON:()=>({})});
  return dialog;
}
function outside(dialog: HTMLElement) { bounds(dialog);point(dialog,"pointerdown");point(dialog,"pointerup"); }

it("closes a viewing surface only after a complete primary backdrop click, never a drag or inner padding click",()=>{
  const close=vi.fn();render(<CapsuleSurface onClose={close}><CapsuleStudio capsule={capsule()} readOnly onClose={close}/></CapsuleSurface>);
  const surface=bounds(screen.getByRole("dialog",{name:"Capsule"}));
  point(surface,"pointerdown",150,150);point(surface,"pointerup"); // Started inside.
  point(surface,"pointerdown",150,150);point(surface,"pointerup",150,150); // Dialog padding.
  point(surface,"pointerdown");point(surface,"pointerup",50,50); // Dragged outside.
  point(surface,"pointerdown");point(surface,"pointerup",20,20,2); // Other pointer.
  point(surface,"pointerdown",20,20,1,2);point(surface,"pointerup"); // Right click.
  point(surface,"pointerdown");point(surface,"pointercancel");point(surface,"pointerup");
  expect(close).not.toHaveBeenCalled();outside(surface);expect(close).toHaveBeenCalledOnce();
});

it("has a safe host fallback and restores the originating focus on unmount",()=>{
  const trigger=document.createElement("button");document.body.append(trigger);trigger.focus();const close=vi.fn();
  const view=render(<CapsuleSurface onClose={close}><p>Loading a read-only Capsule</p></CapsuleSurface>);
  outside(screen.getByRole("dialog",{name:"Capsule"}));expect(close).toHaveBeenCalledOnce();view.unmount();expect(document.activeElement).toBe(trigger);trigger.remove();
});

it("routes an editing surface backdrop through discard confirmation and cancels only the top modal outside",()=>{
  const close=vi.fn();render(<CapsuleSurface><CapsuleStudio capsule={capsule()} isNew onSave={saveResult} onClose={close}/></CapsuleSurface>);
  const surface=screen.getByRole("dialog",{name:"Capsule"});outside(surface);
  const confirmation=screen.getByRole("dialog",{name:"Discard your changes?"});expect(close).not.toHaveBeenCalled();
  outside(surface);expect(screen.getByRole("dialog",{name:"Discard your changes?"})).toBe(confirmation);
  outside(confirmation);expect(screen.queryByRole("dialog",{name:"Discard your changes?"})).toBeNull();expect(close).not.toHaveBeenCalled();
  outside(surface);click("Discard changes");expect(close).toHaveBeenCalledOnce();
});

it("closes clean editor forms outside but retains dirty forms and IME composition, restoring the trigger",()=>{
  const close=vi.fn();render(<CapsuleSurface><CapsuleStudio capsule={capsule()} isNew onSave={saveResult} onClose={close}/></CapsuleSurface>);
  const trigger=button("Add custom entity");trigger.focus();fireEvent.click(trigger);
  outside(screen.getByRole("dialog",{name:"Edit Capsule content"}));expect(screen.queryByRole("dialog",{name:"Edit Capsule content"})).toBeNull();expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);const form=screen.getByRole("dialog",{name:"Edit Capsule content"}),input=screen.getByLabelText("Title");
  fireEvent.compositionStart(input);outside(form);cancel(form);expect(screen.getByRole("dialog",{name:"Edit Capsule content"})).toBe(form);
  fireEvent.compositionEnd(input);change("Title","Keep this input");outside(form);expect((input as HTMLInputElement).value).toBe("Keep this input");expect(screen.getByRole("dialog",{name:"Edit Capsule content"})).toBe(form);expect(close).not.toHaveBeenCalled();
});

it("cancels a safe search outside without letting its late response reopen the dialog",async()=>{
  let resolve!:(result:unknown)=>void;mocks.search.mockImplementation((_query:string,signal:AbortSignal)=>new Promise(done=>{resolve=done;expect(signal.aborted).toBe(false);}));
  render(<CapsuleStudio capsule={capsule()} isNew onSave={saveResult}/>);click("Search the KG");change("Name or alias","query");click("Search");
  const signal=mocks.search.mock.calls[0][1] as AbortSignal;outside(screen.getByRole("dialog",{name:"Add from KG"}));expect(signal.aborted).toBe(true);
  await act(async()=>resolve({items:[]}));expect(screen.queryByRole("dialog",{name:"Add from KG"})).toBeNull();expect(button("Save").hasAttribute("disabled")).toBe(false);
});

it.each(["close button","Escape","backdrop"])("retains workspace comment drafts when closing sharing with %s and confirms only whole-Capsule departure",method=>{
  const close=vi.fn(),commentDraft={hasDraft:()=>true,hasPending:()=>true,clear:vi.fn()};
  render(<CapsuleSurface><CapsuleStudio capsule={capsule()} onSave={saveResult} onClose={close} commentDraft={commentDraft} sharing={<p>Comment draft retained in workspace</p>}/></CapsuleSurface>);
  click("Share");const share=screen.getByRole("dialog",{name:"Share Capsule"});
  if(method==="close button")click("Close sharing");else if(method==="Escape")cancel(share);else outside(share);
  expect(screen.queryByRole("dialog",{name:"Share Capsule"})).toBeNull();expect(close).not.toHaveBeenCalled();
  outside(screen.getByRole("dialog",{name:"Capsule"}));expect(screen.getByText(/A comment submission is unconfirmed/)).toBeTruthy();expect((button("Save and finish") as HTMLButtonElement).disabled).toBe(true);
  click("Keep editing");click("Share");expect(screen.getByText("Comment draft retained in workspace")).toBeTruthy();
});

it("does not close sharing during a mutation or close an outer modal under a nested confirmation",()=>{
  render(<CapsuleStudio capsule={capsule()} onSave={saveResult} sharing={<section aria-busy="true">Posting</section>}/>);click("Share");const share=screen.getByRole("dialog",{name:"Share Capsule"});
  click("Close sharing");cancel(share);outside(share);expect(screen.getByRole("dialog",{name:"Share Capsule"})).toBe(share);
});

it("blocks outside dismissal while saving from a confirmation and during a title composition",async()=>{
  let resolve!:(value:LocalCapsule)=>void;const onSave=vi.fn(()=>new Promise<LocalCapsule>(done=>{resolve=done;})),close=vi.fn();
  render(<CapsuleSurface><CapsuleStudio capsule={capsule()} isNew onSave={onSave} onClose={close}/></CapsuleSurface>);
  click("My graph");fireEvent.compositionStart(screen.getByLabelText("Capsule title"));outside(screen.getByRole("dialog",{name:"Capsule"}));expect(screen.queryByRole("dialog",{name:"Discard your changes?"})).toBeNull();fireEvent.compositionEnd(screen.getByLabelText("Capsule title"));click("Cancel title change");
  outside(screen.getByRole("dialog",{name:"Capsule"}));const confirmation=screen.getByRole("dialog",{name:"Discard your changes?"});click("Save and finish");outside(confirmation);cancel(confirmation);expect(screen.getByRole("dialog",{name:"Discard your changes?"})).toBe(confirmation);expect(close).not.toHaveBeenCalled();await act(async()=>resolve(capsule()));expect(close).toHaveBeenCalledOnce();
});

it("dismisses only the inner modal and ignores bubbled cancel events",()=>{
  const inner=vi.fn(),outer=vi.fn();render(<CapsuleModal title="Outer" onClose={outer}><CapsuleModal title="Inner" onClose={inner}><button>Continue</button></CapsuleModal></CapsuleModal>);
  outside(screen.getByRole("dialog",{name:"Inner"}));expect(inner).toHaveBeenCalledOnce();expect(outer).not.toHaveBeenCalled();
  fireEvent(screen.getByRole("dialog",{name:"Inner"}),new Event("cancel",{bubbles:true,cancelable:true}));expect(inner).toHaveBeenCalledTimes(2);expect(outer).not.toHaveBeenCalled();
});

it("guards browser navigation only when a comment draft exists and clears it only after explicit whole-workspace discard",()=>{
  const close=vi.fn();
  function Workspace() {
    const cache=useDiscussionDraft();
    return <><button onClick={()=>cache.set({key:"capsule:revision:owner",body:"Unposted text",requestId:"uncertain-request"})}>Write a comment</button><CapsuleStudio capsule={capsule()} onSave={saveResult} onClose={close} commentDraft={cache}/></>;
  }
  render(<Workspace/>);expect(window.history.pushState).not.toHaveBeenCalled();expect(unloadIsBlocked()).toBe(false);
  click("Write a comment");expect(window.history.pushState).toHaveBeenCalledOnce();expect(unloadIsBlocked()).toBe(true);
  click("Close Capsule");expect(screen.getByText(/A comment submission is unconfirmed/)).toBeTruthy();click("Keep editing");expect(close).not.toHaveBeenCalled();expect(unloadIsBlocked()).toBe(true);
  click("Close Capsule");click("Discard changes");expect(close).toHaveBeenCalledOnce();expect(unloadIsBlocked()).toBe(false);
});
