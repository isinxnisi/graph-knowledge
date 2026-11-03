import { z } from "zod";
import { knowledgeSelectionCaptureSchema, knowledgeSubmissionContentSchema, type KnowledgeSubmissionContent } from "./knowledge-submission";
import type { CapsuleDocument } from "./capsule-document";
import type {KnowledgeEntityVersion,KnowledgeRecordVersion,KnowledgePin} from "./knowledge-foundation";
import type { GraphState } from "../client/graph-state";
import { displayRelations } from "../client/graph-presentation";
import { relationLabel } from "../client/format";
import {relationPresentation} from "../client/relation-presentation";

type Capture = z.input<typeof knowledgeSelectionCaptureSchema>;
type Context = Capture["context"];
const blankRecord = (): KnowledgeSubmissionContent["items"][number]["record"] => ({ kind: "note" as const, subjectId: null as string|null, objectId: null as string|null, assertion: "", relation: "", polarity: "affirmed" as const, scope: "", times: [], evidence: [] });
const pin = (id:string, revision:number) => ({ id, revision });
const unique = <T extends {id:string;revision:number}>(values:T[]) => [...new Map(values.map(p=>[p.id+"@"+p.revision,p])).values()];

/** Only explicit edges are requested. Their endpoints provide context, not extra changes. */
export function graphSubmissionSelection(graph: GraphState, selected: string[]): Context {
  const relations = displayRelations(graph.claims), entityIds = new Set<string>(), claimIds = new Set<string>();
  for (const key of selected) {
    if (graph.nodes[key]) entityIds.add(key);
    for (const id of relations[key]?.claimIds ?? (graph.claims[key] ? [key] : [])) {
      const claim = graph.claims[id]; if (!claim) continue;
      claimIds.add(id); entityIds.add(claim.subjectId); entityIds.add(claim.objectId);
    }
  }
  if (!entityIds.size && !claimIds.size) throw new Error("Select a subject or relation first");
  return { dataset: "public-kg", ...(graph.revision ? {revision:graph.revision} : {}), entityIds:[...entityIds], claimIds:[...claimIds], entityPins:[], recordPins:[] };
}

export function knowledgeSubmissionSelection(entities:KnowledgeEntityVersion[], records:KnowledgeRecordVersion[], selected:string[],themePin?:KnowledgePin):Context{
  const ids=new Set(selected),chosen=records.filter(r=>ids.has("record:"+r.id)||ids.has(r.id)),entityIds=new Set(selected.filter(id=>entities.some(e=>e.id===id)));
  for(const record of chosen){if(record.content.subjectId)entityIds.add(record.content.subjectId);if(record.content.objectId)entityIds.add(record.content.objectId);}
  if(!chosen.length&&!entityIds.size)throw new Error("Select a subject or relation first");
  return {dataset:"public-kg",entityIds:[],claimIds:[],entityPins:entities.filter(e=>entityIds.has(e.id)).map(e=>pin(e.id,e.revision)),recordPins:chosen.map(r=>pin(r.id,r.revision)),...(themePin?{themePin}:{})};
}

/** Unsaved authored values are proposals; canonical references are resolved again by the server. */
export function capsuleSubmissionSelection(document: CapsuleDocument, selected: string[], title="Capsuleからの投稿"): {context:Context;content:KnowledgeSubmissionContent} {
  const selectedSet = new Set(selected), relations = document.relations.filter(r=>selectedSet.has(r.key));
  const nodeKeys = new Set([...selected.filter(key=>document.nodes.some(n=>n.key===key)), ...relations.flatMap(r=>[r.source,r.target])]);
  const nodes = document.nodes.filter(n=>nodeKeys.has(n.key));
  if (!nodes.length && !relations.length) throw new Error("Select a subject or relation first");
  const context:Context={dataset:"public-kg",entityIds:[],claimIds:[],entityPins:[],recordPins:[]};
  const content:KnowledgeSubmissionContent={schemaVersion:2,attribution:"profile",title,entities:[],entityPins:[],sources:[],sourcePins:[],items:[]};
  const ids = new Map<string,string>();
  const records = document.knowledge?.snapshot.records ?? [];
  const revisions=new Set<string>();
  for (const node of nodes) {
    const origin=node.origin;
    const id=origin.kind==="kg"||origin.kind==="knowledge"||origin.kind==="unresolved"?origin.id:"proposal-node:"+node.key;
    ids.set(node.key,id);
    if(origin.kind==="kg"){context.entityIds!.push(id);if(origin.revision)revisions.add(origin.revision);}
    else if(origin.kind==="unresolved")context.entityIds!.push(id);
    else if(origin.kind==="knowledge"){context.entityPins!.push(pin(id,origin.revision));content.entityPins.push(pin(id,origin.revision));}
    else content.entities.push({id,content:{name:node.title,kind:node.badge||"対象",description:node.description,aliases:[],language:"ja"}});
  }
  for (const node of nodes.filter(n=>selectedSet.has(n.key))) {
    const id=ids.get(node.key)!,origin=node.origin,revision=origin.kind==="knowledge"?origin.revision:1;
    content.items.push({key:"item-node:"+node.key,operation:origin.kind==="local"?"create-entity":"add-information",record:{...blankRecord(),subjectId:id,assertion:origin.kind==="local"?node.description:""},...(origin.kind!=="local"?{about:{kind:"entity" as const,id,revision}}:{})});
  }
  for(const relation of relations){
    const origin=relation.origin,baseline=origin.kind==="knowledge"?records.find(r=>r.id===origin.id&&r.revision===origin.revision):undefined;
    const label=relation.label||(origin.kind==="kg"?(relationPresentation([origin.snapshot],"ja").graphQualification||relationLabel(origin.snapshot,"ja")):baseline?.content.relation)||"";
    const record={...blankRecord(),...baseline?.content,kind:"relation" as const,subjectId:ids.get(relation.source)!,objectId:ids.get(relation.target)!,relation:label,assertion:relation.note||baseline?.content.assertion||label,times:relation.times??baseline?.content.times??[],polarity:origin.kind==="local"?origin.polarity??"affirmed":origin.kind==="kg"?origin.snapshot.polarity:baseline?.content.polarity??"affirmed"};
    const correction=origin.kind==="knowledge"?pin(origin.id,origin.revision):origin.kind==="kg"?pin(origin.id,1):undefined;
    if(origin.kind==="kg"){context.claimIds!.push(origin.id);if(origin.revision)revisions.add(origin.revision);}
    if(origin.kind==="knowledge")context.recordPins!.push(pin(origin.id,origin.revision));
    content.items.push({key:"item-relation:"+relation.key,operation:correction?"correct-record":"create-relation",record,...(correction?{correction,about:{kind:"record" as const,...correction}}:{})});
  }
  // Copy only evidence attached to a selected relation/node, never unrelated Capsule notes.
  for(const evidence of document.evidence.filter(e=>selectedSet.has(e.targetKey))){
    const item=content.items.find(i=>i.key==="item-relation:"+evidence.targetKey||i.key==="item-node:"+evidence.targetKey);
    if(!item||(!evidence.url&&!evidence.note))continue;
    const sourceId="proposal-source:"+evidence.key;
    content.sources.push({id:sourceId,content:{title:evidence.title||"資料",url:evidence.url||null,bibliography:evidence.url?"":evidence.note,language:"ja"}});
    item.record.evidence.push({id:"proposal-evidence:"+evidence.key,source:pin(sourceId,1),locator:evidence.locator||"箇所を確認してください",excerpt:"",stance:evidence.stance});
  }
  // Snapshot source references remain pinned; quotation text is never inferred from annotations.
  const sourceKeys=new Set(content.items.flatMap(i=>i.record.evidence.map(e=>e.source.id+"@"+e.source.revision)));
  content.sourcePins=unique((document.knowledge?.snapshot.sources??[]).filter(s=>sourceKeys.has(s.id+"@"+s.revision)).map(s=>pin(s.id,s.revision)));
  context.entityPins=unique(context.entityPins??[]);context.recordPins=unique(context.recordPins??[]);
  context.entityIds=[...new Set(context.entityIds)];context.claimIds=[...new Set(context.claimIds)];
  if(revisions.size>1)throw new Error("This selection contains multiple KG revisions. Refresh references first.");
  if(revisions.size===1)context.revision=[...revisions][0];
  return {context,content:knowledgeSubmissionContentSchema.parse(content)};
}

