import { explorationHref, URL_STATE_LIMIT } from "./exploration-url";
import { discoveryPathSchema, type DiscoveryPath, type PathConditions } from "../domain/discovery-paths";
export function discoveryPathHref(path: DiscoveryPath, conditions: PathConditions, revision: string) {
  discoveryPathSchema.parse(path);
  const root = path.nodeIds[0];
  const href = explorationHref({ version:1, dataset:"public-kg", id:root,rootId:root,title:"Discovery path",savedAt:"2000-01-01T00:00:00.000Z",
    conditions:{...conditions,organizationPositions:null,eventRoles:null},branches:path.nodeIds.slice(0,-1).map(id=>({id,open:true,pages:1})),view:null });
  const witness=btoa(JSON.stringify({...path,revision})).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
  const result=href+"&via="+witness;
  if(result.length>URL_STATE_LIMIT)throw new Error("Path URL limit");
  return result;
}
