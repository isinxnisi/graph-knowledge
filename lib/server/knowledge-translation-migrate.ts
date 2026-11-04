import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import type {Pool,PoolClient} from "pg";
import {KnowledgeError} from "./knowledge-foundation";
const name='005-text-translations.sql';
async function migration(){const sql=await readFile(path.join(process.cwd(),'migrations/knowledge-foundation',name),'utf8');return {sql,checksum:createHash('sha256').update(sql).digest('hex')};}
export async function assertTranslationSchema(c:PoolClient){const {checksum}=await migration();if((await c.query('SELECT checksum FROM knowledge75.migrations WHERE name=$1',[name])).rows[0]?.checksum!==checksum)throw new KnowledgeError('翻訳用の明示migrationを確認してください',503,'MIGRATION_REQUIRED');}
export async function migrateKnowledgeTranslations(pool:Pool){
 const {sql,checksum}=await migration(),c=await pool.connect();try{
  const db=(await c.query('SELECT current_database() AS name')).rows[0].name;if(!db.startsWith('plunode_knowledge75_'))throw new KnowledgeError('知識専用DBが必要です',503,'WRONG_DATABASE');
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(7500001)');const old=(await c.query('SELECT checksum FROM knowledge75.migrations WHERE name=$1',[name])).rows[0];
  if(old&&old.checksum!==checksum)throw new KnowledgeError('適用済みmigrationが変わっています',503,'MIGRATION_CHANGED');
  if(!old){await c.query(sql);await c.query('INSERT INTO knowledge75.migrations(name,checksum) VALUES($1,$2)',[name,checksum]);}await c.query('COMMIT');return {name,checksum,applied:!old};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
