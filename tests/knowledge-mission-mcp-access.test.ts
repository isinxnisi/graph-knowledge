import {afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {assertMissionMcpUser} from '../lib/server/member/mission-mcp-access';
afterEach(()=>vi.unstubAllEnvs());
it('rejects other identities and callers before accessing the worker bridge',async()=>{
 const id=randomUUID(),query=vi.fn(),pool={query} as unknown as Pool;
 vi.stubEnv('SITE_OPERATIONS_ENABLED','1');vi.stubEnv('COMMUNITY_ENABLED','1');vi.stubEnv('SITE_OPERATOR_USER_IDS',id);
 for(const claims of [{sub:randomUUID(),client_id:'https://chatgpt.com/oauth/client.json'},{sub:id,client_id:'https://other.example/client.json'},{}])await expect(assertMissionMcpUser(pool,claims)).rejects.toMatchObject({code:'OPERATOR_REQUIRED'});
 expect(query).not.toHaveBeenCalled();
});
it('rechecks active operator membership for each authorized call',async()=>{
 const id=randomUUID(),query=vi.fn().mockResolvedValueOnce({rowCount:1}).mockResolvedValueOnce({rowCount:0}),pool={query} as unknown as Pool;
 vi.stubEnv('SITE_OPERATIONS_ENABLED','1');vi.stubEnv('COMMUNITY_ENABLED','1');vi.stubEnv('SITE_OPERATOR_USER_IDS',id);
 const claims={sub:id,client_id:'https://chatgpt.com/oauth/client.json'};
 await assertMissionMcpUser(pool,claims);await expect(assertMissionMcpUser(pool,claims)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 expect(query).toHaveBeenCalledTimes(2);
});
