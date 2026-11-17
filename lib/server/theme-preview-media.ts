import {memberRuntime} from './member/runtime';
import {z} from 'zod';
const resultSchema=z.object({theme:z.object({content:z.object({reading:z.array(z.object({image:z.object({id:z.string().regex(/^[a-f0-9]{64}$/)}).optional()})).max(2).optional()})})});
/** Only a successful authorized read_theme result, never caller-supplied IDs. */
export async function themePreviewMedia(value:unknown){
 const parsed=resultSchema.safeParse(value);if(!parsed.success)return [];
 const ids=[...new Set((parsed.data.theme.content.reading??[]).flatMap(p=>p.image?[p.image.id]:[]))];if(!ids.length)return [];
 const rows=(await memberRuntime().pool.query('SELECT id,bytes FROM product_image_asset WHERE id=ANY($1::text[])',[ids])).rows;
 return ids.flatMap(id=>{const r=rows.find(r=>r.id===id);return r?[{type:'image' as const,mimeType:'image/webp' as const,data:Buffer.from(r.bytes).toString('base64')}]:[];});
}
