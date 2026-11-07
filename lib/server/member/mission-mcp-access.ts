import type {Pool} from 'pg';
import {z} from 'zod';
import {MemberError} from './http';
import {isSiteOperator} from './site-operations';
import {chatGptClientUrl} from './mission-oauth';

export async function assertMissionMcpUser(pool:Pick<Pool,'query'>,claims:{sub?:string;client_id?:unknown}){
 const id=z.uuidv4().safeParse(claims.sub);
 if(!id.success||!isSiteOperator(id.data)||!chatGptClientUrl(String(claims.client_id??'')))throw new MemberError(403,'OPERATOR_REQUIRED');
 if(!(await pool.query('SELECT 1 FROM "user" WHERE id=$1 AND active',[id.data])).rowCount)throw new MemberError(401,'UNAUTHENTICATED');
}
