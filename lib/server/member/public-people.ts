import type {Pool,PoolClient} from "pg";
import {publicProfileImage} from "../../domain/profile-image";
export async function publicPeople(db:Pick<Pool|PoolClient,"query">,ids:string[]) {
 if(process.env.PUBLIC_PROFILES_ENABLED!=="1"||!ids.length)return new Map<string,{handle:string;displayName:string;icon:string;official?:boolean;imageUrl:string|null}>();
 const result=await db.query('SELECT p.user_id,p.handle,p.display_name,p.icon,to_jsonb(p) AS data,u.image FROM public_profile p JOIN "user" u ON u.id=p.user_id AND u.active=true WHERE p.user_id=ANY($1::uuid[])',[[...new Set(ids)]]);
 return new Map(result.rows.map(p=>[p.user_id,{handle:p.handle,displayName:p.display_name,icon:p.icon,...(p.data.official?{official:true}:{}),imageUrl:publicProfileImage(p.icon,p.image)}]));
}
