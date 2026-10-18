import { z } from "zod";
import { allRelations, connectionSelectionSchema, type ConnectionSelection } from "../domain/discovery-connections";
import { publicRevisionSchema } from "../domain/discovery-targets";
import { matchWitnessSchema, validateRelationRoute } from "../domain/relation-patterns";
import { relationConditionKey } from "../domain/relation-conditions";
import { routeKey } from "../domain/pattern-graph";
import { entityDetailSchema, claimDetailSchema } from "../domain/api";
import { explorationHref, decodeExploration, URL_STATE_LIMIT } from "./exploration-url";
import type { SavedWorkspace } from "./saved-workspace";
import { fetchDatasetRevision, fetchEntity, fetchClaim, fetchAdjacentNeighbors, ClientApiError } from "./api";
const handoffSchema=z.strictObject({version:z.literal(1),revision:publicRevisionSchema,witness:matchWitnessSchema.nullable()});
export function discoveryRelationHref(input:ConnectionSelection){
 const value=connectionSelectionSchema.parse(input),relation=value.relation??allRelations(),route=value.witness?.route;
 if(relation.type==="pattern"&&(!route||value.entity.kind!=="work"))throw Error("Missing pattern evidence");
 const href=explorationHref({version:2,dataset:"public-kg",id:value.entity.id,rootId:value.entity.id,title:"Discovery",savedAt:"2000-01-01T00:00:00.000Z",relation,observedRevision:value.revision,view:null,
  execution:relation.type==="pattern"?{type:"pattern",routes:[{route:route!,open:false}],requiredRouteKey:routeKey(route!),candidateBoundary:null,
   entityState:{version:1,branches:[{id:value.entity.id,open:true,claimIds:[route!.claimIds[0]]}],sources:[{id:value.entity.id,requiredRouteKey:routeKey(route!),candidateBoundary:null}]}}
   :{type:"adjacent",branches:[{id:value.entity.id,open:true,pages:1}]}});
 const handoff=handoffSchema.parse({version:1,revision:value.revision,witness:value.witness});
 const result=href+"&match="+btoa(JSON.stringify(handoff)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
 if(result.length>URL_STATE_LIMIT)throw Error("Graph URL limit");return result;
}
export function parseDiscoveryHandoff(encoded:string|null,workspace:SavedWorkspace){
 if(encoded===null)return null;
 if(encoded.length>6000||!/^[\w-]+$/.test(encoded)||workspace.dataset!=="public-kg")throw Error("Invalid Discovery handoff");
 const value=handoffSchema.parse(JSON.parse(atob(encoded.replaceAll("-","+").replaceAll("_","/"))));
 if(value.revision!==workspace.observedRevision||value.witness&&(value.witness.revision!==value.revision||value.witness.route.nodeIds[0]!==workspace.rootId||value.witness.conditionKey!==relationConditionKey(workspace.relation)))throw Error("Inconsistent Discovery witness");
 if(workspace.relation.type==="pattern"&&(!value.witness||workspace.execution.type!=="pattern"||!workspace.execution.routes.some(r=>JSON.stringify(r.route)===JSON.stringify(value.witness!.route))))throw Error("Missing Discovery witness");
 return value;
}
export async function verifyDiscoveryHandoff(value:NonNullable<ReturnType<typeof parseDiscoveryHandoff>>,workspace:SavedWorkspace,signal:AbortSignal){
 const current=await fetchDatasetRevision(signal);if(current.dataset!=="public-kg"||current.revision!==value.revision)throw new ClientApiError("Discovery revision changed",409);
 const ref=value.witness?.route;
 if(!ref)return {nodes:[],claims:[]};
 const [nodes,claims]=await Promise.all([Promise.all(ref.nodeIds.map(async id=>{const e=entityDetailSchema.parse((await fetchEntity(id,signal)).entity);if(e.id!==id)throw Error("Wrong witness entity");return e;})),Promise.all(ref.claimIds.map(async id=>{const c=claimDetailSchema.parse((await fetchClaim(id,signal)).claim);if(c.id!==id||c.withdrawal)throw Error("Wrong witness claim");return c;}))]);
 signal.throwIfAborted();validateRelationRoute(workspace.relation,workspace.rootId,ref,new Map(nodes.map(n=>[n.id,n])),new Map(claims.map(c=>[c.id,c])));
 const after=await fetchDatasetRevision(signal);if(after.dataset!=="public-kg"||after.revision!==value.revision)throw new ClientApiError("Discovery revision changed",409);
 return {nodes,claims};
}
export async function loadDiscoverySelectionEvidence(selection:ConnectionSelection,signal:AbortSignal){
 const href=discoveryRelationHref(selection),params=new URL(href,"https://example.invalid").searchParams,workspace=decodeExploration(params.get("s")!,selection.entity.id,"public-kg");
 const handoff=parseDiscoveryHandoff(params.get("match"),workspace)!;
 const result=await verifyDiscoveryHandoff(handoff,workspace,signal);
 if(selection.witness)return {...result,partial:true};
 const relation=selection.relation??allRelations();if(relation.type!=="adjacent")throw Error("Missing witness");
 const page=await fetchAdjacentNeighbors(selection.entity.id,null,signal,relation,selection.revision);
 const after=await fetchDatasetRevision(signal);if(after.revision!==selection.revision)throw new ClientApiError("Discovery revision changed",409);
 return {nodes:page.nodes,claims:page.claims,partial:page.page.hasMore};
}
