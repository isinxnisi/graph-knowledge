import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {PoolClient} from 'pg';
import {KnowledgeError} from './knowledge-foundation';
export const ACQUISITION_MIGRATION='007-acquisition-inventory.sql';
export async function assertAcquisitionSchema(c:PoolClient){
 const checksum=createHash('sha256').update(await readFile(path.join(process.cwd(),'migrations/knowledge-foundation',ACQUISITION_MIGRATION))).digest('hex');
 if((await c.query('SELECT checksum FROM knowledge75.migrations WHERE name=$1',[ACQUISITION_MIGRATION])).rows[0]?.checksum!==checksum)throw new KnowledgeError('取得証明・対象台帳のmigrationを確認してください',503,'MIGRATION_REQUIRED');
}
