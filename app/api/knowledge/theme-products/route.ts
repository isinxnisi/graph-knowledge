import {themeProductsResponse} from '../../../../lib/server/theme-product-response';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>themeProductsResponse(request);
