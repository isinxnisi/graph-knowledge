import {it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {proxy} from '../proxy';
vi.stubEnv('KG_ADMIN_ENABLED','0');
it.each([['?locale=en','en'],['','ja'],['?locale=invalid','ja']])('pins the authenticated-preview URL language for hydration while retaining the private boundary: %s',async(query,language)=>{const response=await proxy(new NextRequest('https://plunode.net/operations/themes/theme%3Ax'+query,{headers:{host:'plunode.net','x-plunode-public-locale':language==='en'?'ja':'en'}}));expect(response.headers.get('x-middleware-request-x-plunode-public-locale')).toBe(language);expect(response.headers.get('x-robots-tag')).toContain('noindex');expect(response.headers.get('cache-control')).toContain('no-store');});
it.each(['/operations/themes','/member'])('does not force a preview language on other screens: %s',async path=>{const response=await proxy(new NextRequest('https://plunode.net'+path,{headers:{host:'plunode.net','x-plunode-public-locale':'en'}}));expect(response.headers.has('x-middleware-request-x-plunode-public-locale')).toBe(false);});
