import {it,expect,vi,beforeEach} from 'vitest';
const query=vi.hoisted(()=>vi.fn(async()=>({rows:[{id:'a'.repeat(64),bytes:Buffer.from('theme preview')}]})));
vi.mock('../lib/server/member/runtime',()=>({memberRuntime:()=>({pool:{query}})}));
import {themePreviewMedia} from '../lib/server/theme-preview-media';
beforeEach(()=>query.mockClear());
it('returns only images referenced by the successful operator theme read, with no query for unrelated inputs',async()=>{expect(await themePreviewMedia({imageIds:['a'.repeat(64)]})).toEqual([]);expect(query).not.toHaveBeenCalled();const content=await themePreviewMedia({theme:{content:{reading:[{locale:'ja',image:{id:'a'.repeat(64)}},{locale:'en',image:{id:'a'.repeat(64)}}]}}});expect(content).toEqual([{type:'image',mimeType:'image/webp',data:Buffer.from('theme preview').toString('base64')}]);expect(query).toHaveBeenCalledWith(expect.any(String),[['a'.repeat(64)]]);});
