import type {PoolClient} from 'pg';
import type {ImportPrincipal} from '../domain/knowledge-import';

/** Authority comes from the persisted operator theme request, never a package
 * flag, namespace spelling, source text, or the sender's claimed identity.
 * active() must validate the web principal before this check. */
export async function operatorThemeIntake(c:PoolClient,receiptId:string,p:ImportPrincipal){
 if(!p.id.startsWith('web:'))return null;
 const registry=(await c.query("SELECT to_regclass('knowledge_missions.theme_registrations') AS name")).rows[0]?.name;if(!registry)return null;
 const r=(await c.query(`SELECT r.request_id,r.owner_id FROM knowledge_missions.theme_registrations r
 JOIN knowledge_missions.web_deliveries d ON d.request_id=r.request_id AND d.receipt_id=r.receipt_id
 JOIN knowledge_missions.web_importers w ON w.id=d.importer_id AND w.owner_id=r.owner_id
 WHERE r.receipt_id=$1 AND 'web:'||w.id::text=$2 AND w.namespace=$3 AND r.state IN('saved','processing')
 AND r.input->'package'=d.original_payload`,[receiptId,p.id,p.namespace])).rows[0];
 return r?{requestId:String(r.request_id),ownerId:String(r.owner_id)}:null;
}
