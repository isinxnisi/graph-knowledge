import type { KnowledgeSubmissionContent, KnowledgeSubmissionContext } from "../domain/knowledge-submission";
import type { CanvasContent } from "../../components/GraphCanvas";
import type { CanvasRelation, ProposalState } from "./graph-presentation";

export function submissionGraphPreview(content: KnowledgeSubmissionContent, context?: KnowledgeSubmissionContext) {
  const nodes = new Map<string, CanvasContent["nodes"][number]>();
  for(const entity of context?.entities??[])nodes.set(entity.id,{id:entity.id,label:entity.content.name,kind:entity.content.kind,badge:"KG"});
  for(const entity of content.entities)nodes.set(entity.id,{id:entity.id,label:entity.content.name,kind:entity.content.kind,badge:"新しい対象",proposalState:"create"});
  const relations:Record<string,CanvasRelation>={},targets:Record<string,string[]>={},owners:Record<string,string>={};
  const ensureNode=(id:string|null)=>{if(id&&!nodes.has(id))nodes.set(id,{id,label:"対象を取得中",kind:"subject",badge:"参照"});};
  const relation=(id:string,record:KnowledgeSubmissionContent["items"][number]["record"],state?:ProposalState,label?:string)=>{
    if(record.kind!=="relation"||!record.subjectId||!record.objectId)return;
    ensureNode(record.subjectId);ensureNode(record.objectId);
    relations[id]={id,subjectId:record.subjectId,objectId:record.objectId,claimIds:[id],label:record.relation,badge:label??"KG",canvasLabel:record.relation||"関係名を入力",polarity:record.polarity,...(state?{proposalState:state}:{})};
  };
  for(const record of context?.records??[])relation("baseline:"+record.id,record.content);
  content.items.forEach((item,index)=>{
    const operation=item.operation??(item.correction?"correct-record":item.record.kind==="relation"?"create-relation":"add-information");
    const state:ProposalState=operation==="add-evidence"?"evidence":operation==="correct-record"?"change":"create";
    const marker=`${index+1} · ${operation==="create-entity"?"新しい対象":operation==="create-relation"?"新しい関係":operation==="add-evidence"?"根拠を追加":operation==="correct-record"?"訂正":"情報を追加"}`;
    const keys:string[]=[];
    if(item.record.kind==="relation"&&item.record.subjectId&&item.record.objectId){
      const id="proposal:"+item.key;
      // A correction replaces its baseline edge in the preview; all other captured edges stay context.
      if(item.correction)delete relations["baseline:"+item.correction.id];
      relation(id,item.record,state,marker);owners[id]=item.key;keys.push(id);
    }else{
      const entityId=item.about?.kind==="entity"?item.about.id:item.record.subjectId;
      if(entityId){ensureNode(entityId);const node=nodes.get(entityId)!;nodes.set(entityId,{...node,badge:marker,proposalState:state});owners[entityId]=item.key;keys.push(entityId);}
      if(item.about?.kind==="record"){
        const id="baseline:"+item.about.id,edge=relations[id];
        if(edge){relations[id]={...edge,proposalState:state,badge:marker};owners[id]=item.key;keys.push(id);}
      }
    }
    targets[item.key]=keys;
  });
  return {canvas:{nodes:[...nodes.values()],relations},targets,owners};
}
