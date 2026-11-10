import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {memberRuntime} from "../../../lib/server/member/runtime";
import {isSiteOperator} from "../../../lib/server/member/site-operations";
import {editorialCatalogue} from "../../../lib/server/member/product-editorial";

import type {ProductCardItem} from "../../../components/ThemeProducts";
import ProductCardReview from "../../../components/ProductCardReview";
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false},title:'商品カード表示確認 | Plunode'};
export default async function Page(){const {auth,pool}=memberRuntime(),session=await auth.api.getSession({headers:await headers(),query:{disableCookieCache:true}});if(!session?.user.active||!isSiteOperator(session.user.id))notFound();
 const pins=(await pool.query("SELECT DISTINCT ON(id) id,revision FROM product_editorial_version WHERE id LIKE 'qa:product-card:%' ORDER BY id,revision DESC LIMIT 12")).rows;
 const real=(await pool.query("SELECT id,revision FROM product_editorial_version WHERE id='calendar:B0GMV4CK32' ORDER BY revision DESC LIMIT 1")).rows;
 const target={kind:'theme' as const,id:'qa:product-preview',revision:1};
 const catalog=await editorialCatalogue(pool,[...real,...pins],target,{products:[],offers:[],recommendations:[]});
 const items:ProductCardItem[]=catalog.products.sort((a,b)=>catalog.recommendations.findIndex(r=>r.productId===a.id)-catalog.recommendations.findIndex(r=>r.productId===b.id)).map(product=>({product,reason:catalog.recommendations.find(r=>r.productId===product.id)!.reason,target,offer:(()=>{const o=catalog.offers.find(o=>o.productId===product.id&&o.marketplace==='JP'&&o.status==='ready');return o?{...o,image:o.image}:null;})(),alternatives:[],status:catalog.offers.some(o=>o.productId===product.id&&o.status==='ready')?'ready':'unverified'}));
 const first=items[0];if(first){items.push({...first,offer:null,product:{...first.product,id:'qa:missing',title:'【表示試験】画像がない場合',displayName:{ja:'【表示試験】画像がない場合',en:'[Test] No image'},image:undefined}});items.push({...first,offer:null,product:{...first.product,id:'qa:failed',title:'【表示試験】画像を読み込めない場合',displayName:{ja:'【表示試験】画像を読み込めない場合',en:'[Test] Image failed'},image:{url:'/api/knowledge/product-images/'+'0'.repeat(64),width:600,height:600,role:'illustration',alt:{ja:'読み込み失敗テスト',en:'Failed image test'}}}});}
 return <ProductCardReview items={items}/>;
}
