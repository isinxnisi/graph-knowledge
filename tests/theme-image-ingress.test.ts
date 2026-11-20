import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('@better-auth/mcp', () => ({
  requireMcpAuth: (_auth: unknown, handler: (request: Request, claims: object) => Promise<Response>) =>
    (request: Request) => request.headers.get('authorization') === 'Fixture'
      ? handler(request, { sub: 'fixture-owner' })
      : Promise.resolve(new Response(null, { status: 401 })),
}));
vi.mock('../lib/server/member/runtime', () => ({ memberRuntime: () => ({ auth: {}, config: { origin: 'https://plunode.net' }, pool: {} }) }));
vi.mock('../lib/server/member/knowledge-missions', () => ({ missionHandle: (handler: () => Promise<Response>) => handler() }));
vi.mock('../lib/server/member/mission-mcp-access', () => ({ assertMissionMcpUser: vi.fn() }));
vi.mock('../lib/server/member/mission-oauth', () => ({
  missionMcpEnabled: () => true, themeComposeScopeEnabled: () => false, MISSION_SCOPE: 'missions:collect', MISSION_MCP_PATH: '/api/knowledge-collection/mcp',
}));
vi.mock('../lib/server/knowledge-deployment', () => ({ knowledgeCapability: () => true }));
vi.mock('../lib/server/member/knowledge-theme-registration', () => ({ dispatchThemeRegistration: vi.fn() }));
vi.mock('../lib/server/knowledge-mission-mcp', () => ({
  createMissionMcpHandler: () => ({ fetch: async () => new Response(null, { status: 400 }) }),
}));
import { POST } from '../app/api/knowledge-collection/mcp/route';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
function call(body: unknown, allowed = true) {
  vi.stubEnv('KNOWLEDGE_MISSIONS_ENABLED', '1');
  return POST(new Request('https://plunode.net/api/knowledge-collection/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(allowed ? { authorization: 'Fixture' } : {}) },
    body: JSON.stringify(body),
  }));
}

it('records authorized image calls before SDK validation without recording file metadata or invalid IDs', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const requestId = randomUUID();
  const input = (id: string) => ({ method: 'tools/call', params: { name: 'upload_editorial_image', arguments: {
    requestId: id, file: { download_url: 'https://files.oaiusercontent.com/secret?sig=secret', file_id: 'fixture-file' },
  } } });
  expect((await call(input(requestId))).status).toBe(400);
  await call(input('not-an-id'));
  await call(input(requestId), false);
  await call({ method: 'tools/list' });
  expect(log.mock.calls).toEqual([
    ['Editorial image MCP received', { requestId }],
    ['Editorial image MCP received', { requestId: null }],
  ]);
});
