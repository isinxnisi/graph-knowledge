import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({authorize:vi.fn(),list:vi.fn(),redirect:vi.fn(()=>{throw Error('REDIRECT');}),notFound:vi.fn(()=>{throw Error('NOT_FOUND');})}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
vi.mock('next/navigation',()=>({redirect:mock.redirect,notFound:mock.notFound}));
vi.mock('../lib/server/theme-operator-preview',()=>({themeOperator:mock.authorize,operatorThemeList:mock.list,PRIVATE_THEME_HEADERS:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Vary':'Cookie'}}));
import {GET} from '../app/api/site-operations/themes/route';
import Page from '../app/operations/themes/page';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('SITE_OPERATIONS_ENABLED','1');mock.authorize.mockResolvedValue('owner');mock.list.mockResolvedValue([{id:'theme:x',title:'Private theme',current_revision:2,published_revision:1,label:'見直し中',work:{phase:'review',progress:{unfinished:['Review all'],blockers:[],artifacts:{secret:'do not serialize'},brief:'private draft'}}}]);});
afterEach(()=>vi.unstubAllEnvs());
it('authorizes before listing and returns only the progress needed by the existing operations screen',async()=>{
 const r=await GET(new Request('https://plunode.net/api/site-operations/themes',{headers:{'x-member-user':'owner'}}));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');expect(r.headers.get('x-robots-tag')).toContain('noindex');
 expect(mock.list).toHaveBeenCalledWith('owner');const text=await r.text();expect(text).not.toContain('private draft');expect(text).not.toContain('artifacts');expect(JSON.parse(text).items[0]).toMatchObject({state:'review',unfinished:['Review all'],currentRevision:2,publishedRevision:1});
});
it('rejects anonymous/ordinary members and stale account bindings without reading progress',async()=>{
 mock.authorize.mockRejectedValueOnce(Object.assign(Error('denied'),{status:404}));expect((await GET(new Request('https://plunode.net/api/site-operations/themes'))).status).toBe(404);expect(mock.list).not.toHaveBeenCalled();
 expect((await GET(new Request('https://plunode.net/api/site-operations/themes',{headers:{'x-member-user':'other'}}))).status).toBe(401);expect(mock.list).not.toHaveBeenCalled();
});
it('retains the old authenticated entry but opens the real operations section',async()=>{
 await expect(Page()).rejects.toThrow('REDIRECT');expect(mock.redirect).toHaveBeenCalledWith('/operations#themes');
 mock.authorize.mockRejectedValueOnce(Error('denied'));await expect(Page()).rejects.toThrow('NOT_FOUND');expect(mock.redirect).toHaveBeenCalledTimes(1);
});
