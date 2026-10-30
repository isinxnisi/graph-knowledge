import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { publicHandleSchema, publicProfileInput, type PublicProfile } from "../../domain/public-profile";
import { assertMemberOrigin, MemberError, memberInput, memberJson } from "./http";
import { memberTransaction } from "./operations";
import { communityPage, pageTime } from "./community-pagination";

import {googleProfileImage,publicProfileImage} from "../../domain/profile-image";

const missing = () => new MemberError(404, "NOT_FOUND");
export const publicProfilesEnabled = () => process.env.PUBLIC_PROFILES_ENABLED === "1";
const profileSelect = `SELECT p.*, u.image AS provider_image, a.id AS ai_id,a.logical_key,a.operator FROM public_profile p
 LEFT JOIN "user" u ON u.id=p.user_id LEFT JOIN ai_identity a ON a.id=p.ai_identity_id`;
const visibleProfile = `(u.active=true OR a.status='active')`;
export function publicProfileDto(p: QueryResultRow): PublicProfile {
  return { handle:p.handle,kind:p.user_id?"human":"ai",displayName:p.display_name,bio:p.bio,icon:p.icon,imageUrl:publicProfileImage(p.icon,p.provider_image),
    displayNameEn:p.display_name_en??null,bioEn:p.bio_en??null,timelinePublic:p.timeline_public,
    ai:p.ai_id?{id:p.ai_id,key:p.logical_key,operator:p.operator}:null };
}
function handle(value:string) { const result=publicHandleSchema.safeParse(value); if(!result.success)throw missing(); return result.data; }
// Lock in the same order as lifecycle/writes: User -> Profile -> Community.
async function readableProfile(c:PoolClient, value:string) {
  const seed=(await c.query(`${profileSelect} WHERE p.handle=$1 AND ${visibleProfile}`,[value])).rows[0];
  if(!seed)throw missing();
  if(seed.user_id) {
    if((await c.query('SELECT active FROM "user" WHERE id=$1 FOR SHARE',[seed.user_id])).rows[0]?.active!==true)throw missing();
  } else if((await c.query("SELECT status FROM ai_identity WHERE id=$1 FOR SHARE",[seed.ai_id])).rows[0]?.status!=='active')throw missing();
  const row=(await c.query(`${profileSelect} WHERE p.handle=$1 AND ${visibleProfile} FOR SHARE OF p`,[value])).rows[0];
  if(!row)throw missing();return row;
}

export function createPublicProfiles(pool:Pool,origin:string,owner:(req:Request)=>Promise<{id:string}>,secret:string) {
  async function actor(req:Request,write=false) {
    if(write){assertMemberOrigin(req,origin);if(!req.headers.has('x-member-user'))throw new MemberError(400,'EXPECTED_USER_REQUIRED');}
    return owner(req);
  }
  async function active(c:PoolClient,id:string,write=false) {
    if((await c.query(`SELECT active FROM "user" WHERE id=$1 FOR ${write?'UPDATE':'SHARE'}`,[id])).rows[0]?.active!==true)throw new MemberError(401,'UNAUTHENTICATED');
  }
  return {
    async read(req:Request,rawHandle:string) {
      const key=handle(rawHandle);
      return memberTransaction(pool,async c=>{
        const p=await readableProfile(c,key);
        // The same public projection for owner, other members and anonymous readers.
        // Non-AI preparation/held attempts are not apprentice activity.
        if(!p.timeline_public||p.ai_id||process.env.COMMUNITY_ENABLED!=='1')return memberJson({profile:publicProfileDto(p),activities:[],nextCursor:null});
        // Lock current public places before projection, in lifecycle lock order.
        await c.query(`SELECT place.id FROM community place JOIN community_member m ON m.community_id=place.id
          WHERE place.visibility='public' AND place.status<>'suspended' AND m.user_id=$1 AND m.status='active'
          ORDER BY place.id FOR SHARE OF place`,[p.user_id]);
        const page=await communityPage(c,req,secret,'public-activity:'+key,null,String(p.revision),
          `SELECT activity.*,activity.id AS page_id,${pageTime('activity.created_at')} FROM (
            SELECT place.id,'community-created' AS kind,place.title,place.created_at,1 AS revision,'community' AS source_kind,
              '/communities#/'||place.id::text AS href
            FROM community place JOIN community_member m ON m.community_id=place.id AND m.user_id=place.created_by
            WHERE place.created_by=$1 AND place.activity_public AND place.visibility='public' AND place.status<>'suspended'
              AND m.status='active' AND m.generation=place.creator_generation
            UNION ALL
            SELECT t.id,'thread-created',t.title,t.created_at,1,'community-thread','/communities#/threads/'||t.id::text
            FROM community_thread t JOIN community place ON place.id=t.community_id
            JOIN community_post opening ON opening.id=t.opening_post_id AND opening.status='visible' AND opening.author_id=t.author_id
            JOIN community_member m ON m.community_id=place.id AND m.user_id=t.author_id
            WHERE t.author_id=$1 AND t.activity_public AND t.audience='public' AND place.visibility='public' AND place.status<>'suspended'
              AND opening.activity_public AND m.status='active' AND m.generation=t.author_generation AND m.generation=opening.author_generation
            UNION ALL
            SELECT post.id,'community-comment',t.title,post.created_at,post.revision,'community-post',
              '/communities#/threads/'||t.id::text||'?post='||post.id::text
            FROM community_post post JOIN community_thread t ON t.id=post.thread_id JOIN community place ON place.id=t.community_id
            JOIN community_member m ON m.community_id=place.id AND m.user_id=post.author_id
            WHERE post.author_id=$1 AND post.status='visible' AND post.activity_public AND t.activity_public
              AND post.id<>t.opening_post_id AND place.visibility='public' AND place.status<>'suspended' AND t.audience='public'
              AND m.status='active' AND m.generation=post.author_generation
          ) activity WHERE true`,[p.user_id],'activity.created_at','activity.id');
        return memberJson({profile:publicProfileDto(p),activities:page.rows.map(r=>({id:r.id,kind:r.kind,title:r.title,createdAt:r.page_time,href:r.href,
          source:{kind:r.source_kind,id:r.id,revision:r.revision,publisher:'plunode-community',visibility:'public'}})),nextCursor:page.nextCursor});
      });
    },
    async own(req:Request) {
      const u=await actor(req);return memberTransaction(pool,async c=>{await active(c,u.id);
        const p=(await c.query(`${profileSelect} WHERE p.user_id=$1`,[u.id])).rows[0];
        return memberJson({profile:p?publicProfileDto(p):null,revision:p?.revision??0,googleImageUrl:googleProfileImage(p?.provider_image)});
      });
    },
    async save(req:Request) {
      const u=await actor(req,true),input=await memberInput(req,publicProfileInput);
      return memberTransaction(pool,async c=>{
        await active(c,u.id,true);
        const old=(await c.query('SELECT * FROM public_profile WHERE user_id=$1 FOR UPDATE',[u.id])).rows[0];
        if((old?.revision??0)!==input.expectedRevision)throw new MemberError(409,'REVISION_CONFLICT');
        // Claim first, under a unique DB constraint; renames never reassign an old ID.
        let id=old?.id;
        if(!id)id=(await c.query(`INSERT INTO public_profile(user_id,handle,display_name,bio,icon,timeline_public) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[u.id,input.handle,input.displayName,input.bio,input.icon,input.timelinePublic]).catch(e=>{if(e.code==='23505')throw new MemberError(409,'HANDLE_UNAVAILABLE');throw e;})).rows[0].id;
        const claimed=(await c.query('INSERT INTO public_handle_claim(handle,profile_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING handle',[input.handle,id])).rowCount;
        if(!claimed&&(await c.query('SELECT profile_id FROM public_handle_claim WHERE handle=$1',[input.handle])).rows[0]?.profile_id!==id)throw new MemberError(409,'HANDLE_UNAVAILABLE');
        if(old)await c.query(`UPDATE public_profile SET handle=$2,display_name=$3,bio=$4,icon=$5,timeline_public=$6,revision=revision+1 WHERE id=$1`,[id,input.handle,input.displayName,input.bio,input.icon,input.timelinePublic]).catch(e=>{if(e.code==='23505')throw new MemberError(409,'HANDLE_UNAVAILABLE');throw e;});
        const p=(await c.query(`${profileSelect} WHERE p.id=$1`,[id])).rows[0];
        return memberJson({profile:publicProfileDto(p),revision:p.revision,googleImageUrl:googleProfileImage(p.provider_image)});
      });
    },
    async following(req:Request) {
      const u=await actor(req);return memberTransaction(pool,async c=>{await active(c,u.id);
        const page=await communityPage(c,req,secret,'account-following',u.id,'',
          `SELECT p.*,u.image AS provider_image,a.id AS ai_id,a.logical_key,a.operator,f.profile_id AS page_id,${pageTime('f.created_at')}
           FROM account_follow f JOIN public_profile p ON p.id=f.profile_id LEFT JOIN "user" u ON u.id=p.user_id LEFT JOIN ai_identity a ON a.id=p.ai_identity_id
           WHERE f.user_id=$1 AND ${visibleProfile}`,[u.id],'f.created_at','f.profile_id');
        return memberJson({profiles:page.rows.map(publicProfileDto),nextCursor:page.nextCursor});
      });
    },
    async follow(req:Request,rawHandle:string) {
      const write=req.method!=='GET',u=await actor(req,write),key=handle(rawHandle);
      if(write)await memberInput(req,z.strictObject({}));
      return memberTransaction(pool,async c=>{
        // Shared locks on distinct users avoid reciprocal-follow lock inversions.
        await active(c,u.id);
        const p=await readableProfile(c,key);
        if(p.user_id===u.id)throw new MemberError(400,'SELF_FOLLOW');
        if(req.method==='PUT') {
          await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,39))',[u.id]);
          if(Number((await c.query('SELECT count(*) FROM account_follow WHERE user_id=$1',[u.id])).rows[0].count)>=200&&!(await c.query('SELECT 1 FROM account_follow WHERE user_id=$1 AND profile_id=$2',[u.id,p.id])).rowCount)throw new MemberError(422,'FOLLOW_LIMIT');
          await c.query('INSERT INTO account_follow(user_id,profile_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[u.id,p.id]);
        }else if(req.method==='DELETE')await c.query('DELETE FROM account_follow WHERE user_id=$1 AND profile_id=$2',[u.id,p.id]);
        return memberJson({following:!!(await c.query('SELECT 1 FROM account_follow WHERE user_id=$1 AND profile_id=$2',[u.id,p.id])).rowCount});
      });
    },
  };
}

// No second AI run store. A future adapter must verify the current public
// artifact, its issuer/hash/version and the exact run before projecting it.
export type AiActivityReference = {
  aiIdentityId:string; kind:'observation'|'education'|'comment'; runId:string;
  publisher:string; artifactSha256:string; artifactVersion:string; visibility:'public';
};
