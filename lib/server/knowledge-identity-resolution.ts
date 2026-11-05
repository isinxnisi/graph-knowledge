import type {PoolClient} from 'pg';
import {assertIdentitySchema} from './knowledge-identity-migrate';

export const activeIdentityEdges=`SELECT r.left_id,r.right_id FROM knowledge75.entity_identity_links l JOIN knowledge75.entity_identity_revisions r ON r.link_id=l.id AND r.revision=l.current_revision JOIN knowledge75.objects a ON a.kind='entity' AND a.id=r.left_id AND a.current_revision=r.left_revision AND a.visibility='public' JOIN knowledge75.objects b ON b.kind='entity' AND b.id=r.right_id AND b.current_revision=r.right_revision AND b.visibility='public' JOIN knowledge75.published_revisions ap ON ap.kind='entity' AND ap.id=a.id AND ap.revision=a.current_revision JOIN knowledge75.published_revisions bp ON bp.kind='entity' AND bp.id=b.id AND bp.revision=b.current_revision WHERE r.state='same'`;

/** Resolve only current, public, version-bound identity decisions. Seed IDs are
 * retained even when they are new/unlinked. Never rewrite original records. */
export async function resolveIdentityGroups(c:PoolClient,ids:string[]){
 await assertIdentitySchema(c);
 const seeds=[...new Set(ids)].sort();
 if(!seeds.length)return new Map<string,string[]>();
 await c.query('SET LOCAL jit=off');
 const rows=(await c.query(`WITH RECURSIVE edges AS MATERIALIZED (${activeIdentityEdges}),
 members(seed,id) AS (SELECT id,id FROM unnest($1::text[]) id UNION
 SELECT m.seed,CASE WHEN e.left_id=m.id THEN e.right_id ELSE e.left_id END
 FROM members m JOIN edges e ON e.left_id=m.id OR e.right_id=m.id)
 SELECT seed,array_agg(id ORDER BY id) AS ids FROM members GROUP BY seed ORDER BY seed`,[seeds])).rows;
 return new Map(rows.map(r=>[r.seed as string,r.ids as string[]]));
}
export async function identityGroup(c:PoolClient,ids:string[]){
 return [...new Set([...(await resolveIdentityGroups(c,ids)).values()].flat())].sort();
}
