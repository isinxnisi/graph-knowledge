import neo4j from 'neo4j-driver';
import {openDatabase,readQueryTimeout} from './neo4j';
import {readPublicRevision} from './public-revision';
import {knowledgeDigest} from './knowledge-foundation';
import type {LegacyInventoryReader,InventoryCursor,InventoryEntry} from './knowledge-target-inventory';
/** Canonical public KG only. Never writes Neo4j or a collection/ops dataset. */
export const readLegacyTargetInventory:LegacyInventoryReader=async input=>{
 const db=openDatabase(),session=db.driver.session({database:db.database,defaultAccessMode:'READ'});
 try{return await session.executeRead(async tx=>{
  const revision=await readPublicRevision(tx,input.revision??null);
  const rows=(await tx.run(`CALL {
   MATCH (e:Entity) RETURN 'entity' AS kind,e.id AS id,properties(e) AS body,'public' AS visibility
   UNION ALL
   MATCH (c:Claim) RETURN 'record' AS kind,c.id AS id,properties(c) AS body,coalesce(c.visibility,'unpublished') AS visibility
   UNION ALL
   MATCH (s:Source) RETURN 'source' AS kind,s.id AS id,properties(s) AS body,'public' AS visibility
  }
  WITH kind,id,body,visibility WHERE $kind IS NULL OR kind>$kind OR (kind=$kind AND id>$id)
  RETURN kind,id,body,visibility ORDER BY kind,id LIMIT $take`,{kind:input.after?.kind??null,id:input.after?.id??null,take:neo4j.int(input.limit+1)})).records;
  const items:InventoryEntry[]=rows.slice(0,input.limit).map(row=>({kind:row.get('kind'),id:row.get('id'),revision,statusRevision:revision,digest:knowledgeDigest(JSON.parse(JSON.stringify(row.get('body')))),visibility:row.get('visibility'),eligible:row.get('kind')!=='record'||row.get('visibility')==='published'}));
  await readPublicRevision(tx,revision);
  return {revision,items,next:rows.length>input.limit?{kind:items.at(-1)!.kind,id:items.at(-1)!.id} as InventoryCursor:null};
 },{timeout:readQueryTimeout()});}finally{await session.close();await db.driver.close();}
};
