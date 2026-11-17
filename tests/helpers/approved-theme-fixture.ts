import type {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createKnowledgeFoundationService} from '../../lib/server/knowledge-foundation';
import {capturedThemeTranslations,freezeThemeReleases} from '../../lib/server/knowledge-theme-publication';
/** An already independently approved fixture for tests of OTHER contracts.
 * Actual review/activation/lease behavior is exercised by production integration.
 * This helper is forbidden outside the disposable test database. */
export async function approveThemeFixture(pool:Pool,id:string){
 if(!(await pool.query('SELECT current_database() AS db')).rows[0].db.startsWith('plunode_knowledge75_test'))throw Error('Only disposable test fixtures may be approved');
 const theme=await createKnowledgeFoundationService(pool).get({kind:'operator',id:'approved-fixture'},'theme',id),c=await pool.connect(),release=randomUUID();
 try{await c.query('BEGIN');await freezeThemeReleases(c,id);const translations=JSON.stringify(await capturedThemeTranslations(c,theme));await c.query('INSERT INTO knowledge75.theme_releases(theme_id,revision,release_id,theme_translations) VALUES($1,$2,$3,$4) ON CONFLICT(theme_id,revision) DO UPDATE SET release_id=$3,theme_translations=$4',[id,theme.revision,release,translations]);await c.query("INSERT INTO knowledge75.theme_release_approvals(release_id,theme_id,revision,proof,theme_translations,image_ids) VALUES($1,$2,$3,'{\"fixture\":true}', $4,'[]')",[release,id,theme.revision,translations]);await c.query('UPDATE knowledge75.theme_publications SET published_revision=$2,release_id=$3,updated_at=clock_timestamp() WHERE theme_id=$1',[id,theme.revision,release]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
