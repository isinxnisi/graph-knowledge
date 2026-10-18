import { z } from "zod";
import { entityDetailSchema } from "./api";
import { catalogFiltersSchema, initialCatalogFilters, type CatalogPreset } from "./discovery-preset-catalog";
import { publicRevisionSchema, targetCriteriaSchema, targetSearchResponseSchema } from "./discovery-targets";
import { relationConditionSchema, relationConditionKey, type RelationCondition } from "./relation-conditions";
import { matchWitnessSchema } from "./relation-patterns";
import { questionPredicates } from "./discovery-prototype";
export const allRelations = (): Extract<RelationCondition,{type:"adjacent"}> => ({ version:1,type:"adjacent",predicates:null,traversal:"either",polarity:"all-records",contributionRoles:null,organizationPositions:null,eventRoles:null });
export const otherWorks = (roles: import("./exploration").ContributionRoleFilter = null): Extract<RelationCondition,{type:"pattern"}> => ({version:1,type:"pattern",pattern:{id:"other-works",revision:1},polarity:"affirmed",contributionRoles:roles});
export function presetApplication(p: CatalogPreset): {binding:"bound"|"unbound";relation:RelationCondition;id?:string} | {binding:"legacy"} {
  if(p.execution.type==="fixed")return {binding:"bound",id:p.execution.anchorId,relation:{...allRelations(),type:"adjacent",predicates:[questionPredicates[p.question]!],contributionRoles:p.role?[p.role]:null}};
  return p.execution.path.id==="other-works"?{binding:"unbound",relation:otherWorks(p.role?[p.role]:null)}:{binding:"legacy"};
}
export const connectionSelectionSchema=z.strictObject({entity:entityDetailSchema,relation:relationConditionSchema.nullable(),revision:publicRevisionSchema,witness:matchWitnessSchema.nullable()}).superRefine((s,ctx)=>{
 if(s.relation?.type==="pattern"&&(!s.witness||s.entity.kind!=="work")||s.witness&&(!s.relation||s.witness.revision!==s.revision||s.witness.conditionKey!==relationConditionKey(s.relation)||s.witness.route.nodeIds[0]!==s.entity.id||s.witness.route.claimIds.length!==(s.relation.type==="pattern"?2:1)))ctx.addIssue({code:"custom",message:"Invalid selected subject evidence"});
});
export type ConnectionSelection=z.infer<typeof connectionSelectionSchema>;
const scroll=z.number().min(0).max(100000);
export const TARGET_HISTORY_PAGES=256;
export const connectionsWorkspaceSchema=z.strictObject({version:z.literal(1),step:z.enum(["presets","targets","selected"]),filters:catalogFiltersSchema,
  criteria:z.strictObject({q:z.string().max(100),kind:z.enum(["person","work","organization","event"]).nullable(),relation:relationConditionSchema.nullable()}),
  cursors:z.array(z.string().max(4096).nullable()).min(1).max(TARGET_HISTORY_PAGES),cache:targetSearchResponseSchema.nullable(),selected:connectionSelectionSchema.nullable(),
  activePreset:z.string().nullable(),scrolls:z.strictObject({presets:scroll,targets:scroll,selected:scroll})});
export type ConnectionsWorkspace=z.infer<typeof connectionsWorkspaceSchema>;
export const initialConnectionsWorkspace:ConnectionsWorkspace={version:1,step:"presets",filters:initialCatalogFilters,criteria:{q:"",kind:null,relation:null},cursors:[null],cache:null,selected:null,activePreset:null,scrolls:{presets:0,targets:0,selected:0}};
export const canonicalTargetCriteria=(input:ConnectionsWorkspace["criteria"])=>targetCriteriaSchema.safeParse(input);
