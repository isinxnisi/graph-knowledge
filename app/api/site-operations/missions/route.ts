import {memberRuntime} from '../../../../lib/server/member/runtime';
import {missionHandle} from '../../../../lib/server/member/knowledge-missions';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(r:Request){return missionHandle(()=>memberRuntime().service.missions.list(r));}
export function POST(r:Request){return missionHandle(()=>memberRuntime().service.missions.act(r));}
