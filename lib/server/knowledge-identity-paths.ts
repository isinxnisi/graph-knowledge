import type {PoolClient} from 'pg';
import {activeIdentityEdges} from './knowledge-identity-resolution';

export type KnowledgeIdentityStep={at:number;from:string;to:string};
/** Identity is a zero-relation transition, explicitly returned rather than a fabricated Record. */
export async function readIdentityPaths(c:PoolClient,input:{generation:string;from:string;to:string;maxDepth:number;limit:number;readableSql:string}){
 await c.query('SET LOCAL jit=off');
 const rows=(await c.query(`WITH RECURSIVE
 identity_edges AS MATERIALIZED (${activeIdentityEdges}
  AND EXISTS(SELECT 1 FROM knowledge75.publication_entities x WHERE x.generation=$1 AND x.id=r.left_id AND x.revision=r.left_revision)
  AND EXISTS(SELECT 1 FROM knowledge75.publication_entities x WHERE x.generation=$1 AND x.id=r.right_id AND x.revision=r.right_revision)),
 members(seed,id) AS (
  SELECT e.id,e.id FROM knowledge75.publication_entities e JOIN knowledge75.objects o ON o.kind='entity' AND o.id=e.id AND o.visibility='public' WHERE e.generation=$1
  UNION SELECT m.seed,CASE WHEN i.left_id=m.id THEN i.right_id ELSE i.left_id END FROM members m JOIN identity_edges i ON i.left_id=m.id OR i.right_id=m.id),
 canonical AS MATERIALIZED (SELECT seed AS id,min(id) AS canonical FROM members GROUP BY seed),
 records AS MATERIALIZED (SELECT r.id,r.subject_id,r.object_id,a.canonical AS a,b.canonical AS b FROM knowledge75.publication_records r
  JOIN canonical a ON a.id=r.subject_id JOIN canonical b ON b.id=r.object_id
  WHERE r.generation=$1 AND r.body#>>'{record,content,kind}'='relation' AND ${input.readableSql}),
 arcs AS (SELECT id,a AS from_id,b AS to_id,subject_id AS source_id,object_id AS target_id FROM records UNION ALL SELECT id,b,a,object_id,subject_id FROM records),
 walk(node,record_ids,entity_ids,identity_steps,visited) AS (
  SELECT canonical,ARRAY[]::text[],ARRAY[$2]::text[],'[]'::jsonb,ARRAY[canonical] FROM canonical WHERE id=$2
  UNION ALL
  SELECT a.to_id,w.record_ids||a.id,w.entity_ids||a.target_id,
   w.identity_steps||CASE WHEN w.entity_ids[cardinality(w.entity_ids)]<>a.source_id THEN jsonb_build_array(jsonb_build_object('at',cardinality(w.record_ids),'from',w.entity_ids[cardinality(w.entity_ids)],'to',a.source_id)) ELSE '[]'::jsonb END,w.visited||a.to_id
  FROM walk w JOIN arcs a ON a.from_id=w.node
  WHERE cardinality(w.record_ids)<$4 AND w.node<>(SELECT canonical FROM canonical WHERE id=$3) AND NOT a.to_id=ANY(w.visited))
 SELECT record_ids,entity_ids,identity_steps||CASE WHEN entity_ids[cardinality(entity_ids)]<>$3 THEN jsonb_build_array(jsonb_build_object('at',cardinality(record_ids),'from',entity_ids[cardinality(entity_ids)],'to',$3)) ELSE '[]'::jsonb END AS identity_steps
 FROM walk WHERE node=(SELECT canonical FROM canonical WHERE id=$3)
 ORDER BY cardinality(record_ids),record_ids,entity_ids LIMIT $5`,[input.generation,input.from,input.to,input.maxDepth,input.limit+1])).rows;
 return rows.map(row=>({recordIds:row.record_ids as string[],entityIds:row.entity_ids as string[],...(row.identity_steps.length?{identitySteps:row.identity_steps as KnowledgeIdentityStep[]}:{})}));
}
