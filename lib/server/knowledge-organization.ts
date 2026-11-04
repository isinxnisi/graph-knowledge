import type {Pool} from "pg";
import {organizationQuerySchema,organizationPageSchema} from "../domain/knowledge-organization";
// This screen reviews current public record versions, including their original
// wording/evidence. It does not rewrite entities or Theme/Capsule snapshots.
export function createKnowledgeOrganization(pool:Pool){
 return {async list(raw:unknown){
  const q=organizationQuerySchema.parse(raw),c=await pool.connect();
  try{await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
   const clauses=[`o.kind='record' AND o.visibility='public'`,
    `EXISTS(SELECT 1 FROM knowledge75.published_revisions p WHERE p.kind='record' AND p.id=o.id AND p.revision=o.current_revision)`,
    `NOT EXISTS(SELECT 1 FROM knowledge75.objects e WHERE e.kind='entity' AND e.id IN (r.content->>'subjectId',r.content->>'objectId') AND e.visibility<>'public')`,
    `NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.content->'evidence') ev LEFT JOIN knowledge75.objects s ON s.kind='source' AND s.id=ev->'source'->>'id' WHERE s.visibility IS DISTINCT FROM 'public')`];
   const args:unknown[]=[];
   if(q.q){args.push('%'+q.q.replace(/[\\%_]/g,'\\$&')+'%');clauses.push(`(r.content->>'assertion' ILIKE $1 OR r.content->>'relation' ILIKE $1 OR se.content->>'name' ILIKE $1 OR oe.content->>'name' ILIKE $1)`);}
   const current=`m.content->>'recordRevision'=o.current_revision::text AND m.content->'concept' IS NOT NULL AND m.content->'concept'<>'null'::jsonb`;
   if(q.state==='mapped')clauses.push('('+current+')');
   if(q.state==='unmapped')clauses.push(`(m.id IS NULL OR m.content->'concept'='null'::jsonb)`);
   if(q.state==='stale')clauses.push(`(m.id IS NOT NULL AND m.content->>'recordRevision'<>o.current_revision::text)`);
   const from=`FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision LEFT JOIN knowledge75.objects mo ON mo.kind='mapping' AND mo.id=o.id LEFT JOIN knowledge75.revisions m ON m.kind='mapping' AND m.id=mo.id AND m.revision=mo.current_revision LEFT JOIN knowledge75.objects sh ON sh.kind='entity' AND sh.id=r.content->>'subjectId' LEFT JOIN knowledge75.revisions se ON se.kind='entity' AND se.id=sh.id AND se.revision=sh.current_revision LEFT JOIN knowledge75.objects oh ON oh.kind='entity' AND oh.id=r.content->>'objectId' LEFT JOIN knowledge75.revisions oe ON oe.kind='entity' AND oe.id=oh.id AND oe.revision=oh.current_revision`;
   const where=clauses.join(' AND '),total=Number((await c.query('SELECT count(*) AS n '+from+' WHERE '+where,args)).rows[0].n);
   if(q.after){args.push(q.after);clauses.push('o.id>$'+args.length);}
   const rows=(await c.query(`SELECT o.id,o.current_revision AS revision,r.content,se.content->>'name' AS subject,oe.content->>'name' AS object,COALESCE(m.revision,0) AS "mappingRevision",(m.content->>'recordRevision')::integer AS "mappedRecordRevision",m.content->'concept' AS concept ${from} WHERE ${clauses.join(' AND ')} ORDER BY o.id LIMIT 26`,args)).rows;
   // Suggestions are reuse candidates for EXACT concrete wording, never an AI
   // assertion of equivalence. Operator reviews definition before applying.
   for(const r of rows.slice(0,25)){r.suggestions=(await c.query(`SELECT DISTINCT m.content->'concept' AS concept FROM knowledge75.objects o JOIN knowledge75.revisions v ON v.kind=o.kind AND v.id=o.id AND v.revision=o.current_revision JOIN knowledge75.objects mh ON mh.kind='mapping' AND mh.id=o.id JOIN knowledge75.revisions m ON m.kind='mapping' AND m.id=mh.id AND m.revision=mh.current_revision WHERE o.kind='record' AND o.visibility='public' AND v.content->>'relation'=$1 AND $1<>'' AND m.content->>'recordRevision'=o.current_revision::text AND m.content->'concept'<>'null'::jsonb ORDER BY concept LIMIT 5`,[r.content.relation])).rows.map(v=>v.concept);}
   const concepts=(await c.query(`SELECT body FROM knowledge75.concepts ORDER BY id,revision DESC LIMIT 101`)).rows.map(r=>r.body);
   await c.query('COMMIT');return organizationPageSchema.parse({items:rows.slice(0,25),total,next:rows.length>25?rows[24].id:null,concepts:concepts.slice(0,100),catalogTruncated:concepts.length>100});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }};
}
