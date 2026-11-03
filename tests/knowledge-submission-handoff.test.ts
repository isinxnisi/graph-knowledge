import {expect,it,vi} from "vitest";
import {graphSubmissionSelection,capsuleSubmissionSelection,createSelectionSubmission} from "../lib/client/knowledge-submission-handoff";
import {submissionGraphPreview} from "../lib/client/knowledge-submission-preview";
import {emptyGraph} from "../lib/client/graph-state";
import {captureCapsule} from "../lib/client/capsule-editor";
import {displayRelations} from "../lib/client/graph-presentation";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import {type NeighborsResponse} from "../lib/domain/api";
const handoff=vi.hoisted(()=>({memberRequest:vi.fn(),authenticated:true}));
vi.mock("../lib/client/use-member-identity",()=>({getMemberIdentitySnapshot:()=>({status:handoff.authenticated?"authenticated":"guest",user:handoff.authenticated?{id:"fixture-owner"}:null})}));
vi.mock("../lib/client/member-api",async()=>({...await vi.importActual("../lib/client/member-api"),memberRequest:handoff.memberRequest}));
const page=examples.neighbors as NeighborsResponse;
function graph(){return {...emptyGraph(1),revision:"release-fixed",nodes:Object.fromEntries(page.nodes.map(n=>[n.id,n])),claims:Object.fromEntries(page.claims.map(c=>[c.id,c]))};}
it("submits only explicitly selected grouped claims, retaining endpoint context",()=>{
 const g=graph(),relation=Object.values(displayRelations(g.claims))[0],request=graphSubmissionSelection(g,[relation.id]);
 expect(request.claimIds?.sort()).toEqual(relation.claimIds.sort());
 expect(request.entityIds?.sort()).toEqual([relation.subjectId,relation.objectId].sort());
 const nodeOnly=graphSubmissionSelection(g,[relation.subjectId]);expect(nodeOnly.claimIds).toEqual([]);
});
it("keeps old KG identity and only selected unsaved proposals, leaving unrelated private text behind",()=>{
 const g=graph(),capsule=captureCapsule(g,null,"public-kg","Example"),doc=capsule.document!,relation=doc.relations[0];
 relation.label="未保存の具体的な関係";relation.note="未保存の説明";
 doc.texts.push({key:"private-note",text:"NEVER_SEND",position:{x:0,y:0}} as never);
 const selection=capsuleSubmissionSelection(doc,[relation.key],capsule.title);
 expect(selection.content.items).toHaveLength(1);expect(selection.content.entities).toEqual([]);
 expect(selection.content.items[0]).toMatchObject({operation:"correct-record",correction:{id:relation.origin.kind==="kg"?relation.origin.id:"",revision:1},record:{assertion:"未保存の説明",relation:"未保存の具体的な関係"}});
 expect(JSON.stringify(selection)).not.toContain("NEVER_SEND");
 expect(selection.context.claimIds).toHaveLength(1);
});
it("previews existing context and blue proposed relations without creating fake links for notes",()=>{
 const [a,b]=page.nodes;
 const content={title:"New",entities:[],entityPins:[],sources:[],sourcePins:[],items:[{key:"new-edge",operation:"create-relation" as const,record:{kind:"relation" as const,subjectId:a.id,objectId:b.id,assertion:"A new fact",relation:"具体的な関係",polarity:"affirmed" as const,scope:"",times:[],evidence:[]}}]};
 const context={entities:[a,b].map(e=>({id:e.id,content:{name:e.name,kind:e.kind,description:e.description??"",aliases:[],language:"ja"}})),sources:[]};
 const preview=submissionGraphPreview(content,context);
 expect(preview.canvas.relations["proposal:new-edge"]).toMatchObject({proposalState:"create",badge:"1 · 新しい関係"});
 expect(preview.targets["new-edge"]).toEqual(["proposal:new-edge"]);
 const note=submissionGraphPreview({...content,items:[{...content.items[0],operation:"add-information",record:{...content.items[0].record,kind:"note",objectId:null},about:{kind:"entity",id:a.id,revision:1}}]},context);
 expect(Object.keys(note.canvas.relations)).toHaveLength(0);expect(note.canvas.nodes.find(n=>n.id===a.id)?.proposalState).toBe("create");
});

it("binds each draft capture to the current authenticated identity and rejects guests before sending",async()=>{
 handoff.memberRequest.mockResolvedValue({submission:{id:"new-draft-id"}});
 const context=graphSubmissionSelection(graph(),[page.nodes[0].id]);
 expect(await createSelectionSubmission({context})).toBe("/member/submissions?id=new-draft-id");
 expect(handoff.memberRequest).toHaveBeenCalledWith("/api/member/knowledge-submissions",expect.anything(),expect.objectContaining({method:"POST",user:"fixture-owner",body:expect.objectContaining({action:"capture-selection",context})}));
 handoff.memberRequest.mockClear();handoff.authenticated=false;
 try{await expect(createSelectionSubmission({context})).rejects.toMatchObject({status:401});expect(handoff.memberRequest).not.toHaveBeenCalled();}finally{handoff.authenticated=true;}
});
