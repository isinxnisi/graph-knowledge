import type {Pool} from 'pg';
import {organizationStatusSchema} from '../domain/knowledge-patrol';
import {assertOrganizationSchema} from './knowledge-organization-schema';

/** Counts only: operator status never returns candidate text or stopped inputs. */
export async function readOrganizationStatus(pool:Pool){
 await assertOrganizationSchema(pool);
 const rows=(await pool.query(`SELECT
  (SELECT count(*)::int FROM knowledge75.organization_index i JOIN knowledge75.patrol_targets p ON p.origin=i.origin AND p.kind=i.kind AND p.id=i.id AND p.generation=i.target_generation WHERE p.present AND p.eligible) AS indexed,
  count(*) FILTER(WHERE state IN('queued','running','retry','quota','verified'))::int AS waiting,
  count(*) FILTER(WHERE state='applied')::int AS applied,
  count(*) FILTER(WHERE state='unresolved')::int AS unresolved,
  count(*) FILTER(WHERE state='rejected')::int AS rejected,
  min(next_attempt) FILTER(WHERE state IN('retry','quota')) AS next_attempt
  FROM knowledge75.organization_candidates`)).rows[0];
 return organizationStatusSchema.parse({...rows,nextAttemptAt:rows.next_attempt?.toISOString()??null});
}
