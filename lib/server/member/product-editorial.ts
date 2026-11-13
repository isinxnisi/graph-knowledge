import type {Pool,PoolClient} from "pg";
import {createHash} from "node:crypto";
import {productAuthoringCommandSchema,type ProductAuthoringCommand} from "../../domain/product-authoring";
import {productSchema,type ProductCatalogue} from "../../domain/product-contract";
import {processProductImage} from "../product-image-processing";
import {KnowledgeError} from "../knowledge-foundation";
import {isSiteOperator} from "./site-operations";
import {memberTransaction} from "./operations";
const fail=(message:string,code="PRODUCT_CONFLICT")=>new KnowledgeError(message,409,code);
export async function authorizeProductOperator(c:Pool|PoolClient,owner:string){
 if(!isSiteOperator(owner)||!(await c.query('SELECT 1 FROM "user" WHERE id=$1 AND active FOR SHARE',[owner])).rowCount)throw new KnowledgeError("運営アカウントで接続してください。",403,"OPERATOR_REQUIRED");
}
export async function readEditorialProduct(c:Pool|PoolClient,id:string,revision?:number){
 const row=(await c.query('SELECT revision,content FROM product_editorial_version WHERE id=$1 AND ($2::integer IS NULL OR revision=$2) ORDER BY revision DESC LIMIT 1',[id,revision??null])).rows[0];
 if(!row)throw new KnowledgeError("商品が見つかりません。",404,"PRODUCT_NOT_FOUND");return {id,revision:row.revision,...row.content};
}
export async function validateProductPins(c:Pool|PoolClient,pins:{id:string;revision:number}[]){
 if(new Set(pins.map(p=>p.id)).size!==pins.length)throw fail("同じ商品は一つの版を選んでください。");
 for(const p of pins)await readEditorialProduct(c,p.id,p.revision);
}
/** Every write uses the same operator authorization, immutable versions and replay contract on HTTP and MCP. */
export async function dispatchProductAuthoring(pool:Pool,owner:string,raw:ProductAuthoringCommand){
 const command=productAuthoringCommandSchema.parse(raw);await authorizeProductOperator(pool,owner);
 if(command.action==="find-products"){
  const rows=(await pool.query(`WITH current AS(SELECT DISTINCT ON(id) id,revision,content FROM product_editorial_version ORDER BY id,revision DESC) SELECT id,revision,content FROM current WHERE position(lower($1) in lower(content::text))>0 ORDER BY id OFFSET $2 LIMIT 21`,[command.query,command.cursor])).rows;
  return {products:rows.slice(0,20).map(v=>({id:v.id,revision:v.revision,...v.content})),nextCursor:rows.length>20?command.cursor+20:null};
 }
 if(command.action==="read-product")return readEditorialProduct(pool,command.id,command.revision);
 const digest=createHash("sha256").update(JSON.stringify(command)).digest("hex");
 // Bound and validate binary before obtaining a database transaction; no temporary file is created.
 let processed:Awaited<ReturnType<typeof processProductImage>>|undefined;
 if(command.action==="upload-product-image"){
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(command.base64)||command.base64.length%4!==0)throw new KnowledgeError("画像データを確認してください。",400,"IMAGE_INVALID");
  processed=await processProductImage(Buffer.from(command.base64,"base64"));
 }
 return memberTransaction(pool,async c=>{
  await authorizeProductOperator(c,owner);
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['product-editorial']);
  const previous=(await c.query('SELECT * FROM product_editorial_request WHERE request_id=$1',[command.requestId])).rows[0];
  if(previous){if(previous.owner_id!==owner||previous.digest!==digest)throw fail("同じ受付IDに異なる内容は送れません。","REQUEST_CHANGED");if(command.action!=="upload-product-image"||(await c.query('SELECT 1 FROM product_image_asset WHERE id=$1',[previous.result.imageId])).rowCount)return {...previous.result,replayed:true};}
  if(Number((await c.query("SELECT count(*) AS n FROM product_editorial_request WHERE owner_id=$1 AND created_at>clock_timestamp()-interval '1 day'",[owner])).rows[0].n)>=500)throw new KnowledgeError("本日の素材登録上限です。既存素材は引き続き使えます。",429,"EDITORIAL_DAILY_LIMIT");
  let result:Record<string,unknown>;
  if(command.action==="upload-product-image"&&processed){
   const profile=command.provenance,profileId=profile?.id??command.provenanceId!;
   if(profile){const old=(await c.query('SELECT content FROM product_image_provenance WHERE id=$1',[profileId])).rows[0];if(old&&JSON.stringify(old.content)!==JSON.stringify(JSON.parse(JSON.stringify(profile)))){
     // JSONB property order is not stable.
     if(createHash('sha256').update(JSON.stringify(Object.entries(old.content).sort())).digest('hex')!==createHash('sha256').update(JSON.stringify(Object.entries(profile).sort())).digest('hex'))throw fail("素材の利用条件を変える場合は別のプロフィールIDを使ってください。");
    }await c.query('INSERT INTO product_image_provenance VALUES($1,$2) ON CONFLICT DO NOTHING',[profileId,JSON.stringify(profile)]);}
   if(!(await c.query('SELECT 1 FROM product_image_provenance WHERE id=$1',[profileId])).rowCount)throw fail("素材の由来を先に登録してください。");
   // Content-address includes provenance and role: the same pixels can have different usage rights.
   const id=createHash('sha256').update(processed.id+profileId+command.role+JSON.stringify(command.alt)).digest('hex');
   const quota=Number((await c.query('SELECT coalesce(sum(octet_length(bytes)+octet_length(thumbnail)),0) AS bytes FROM product_image_asset')).rows[0].bytes);
   if(quota>2_000_000_000)throw new KnowledgeError("画像保存容量の上限です。既存の画像は利用できます。",429,"IMAGE_STORAGE_LIMIT");
   await c.query('INSERT INTO product_image_asset(id,provenance_id,role,alt,width,height,bytes,thumbnail,original) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[id,profileId,command.role,JSON.stringify(command.alt),processed.width,processed.height,processed.bytes,processed.thumbnail,JSON.stringify(processed.original)]);
   result={imageId:id,url:'/api/knowledge/product-images/'+id,width:processed.width,height:processed.height,bytes:processed.processedBytes,thumbnailBytes:processed.thumbnailBytes,original:processed.original,role:command.role};
  }else if(command.action==="save-product"){
   const current=Number((await c.query('SELECT coalesce(max(revision),0) AS revision FROM product_editorial_version WHERE id=$1',[command.product.id])).rows[0].revision);
   if(current!==command.expectedRevision)throw fail("商品が更新されました。read_productで最新の版を確認してください。");
   if(command.offers.some(o=>o.productId!==command.product.id))throw fail("商品と販売先のIDを揃えてください。");
   if(new Set(command.offers.map(o=>o.marketplace)).size!==command.offers.length)throw fail("販売地域ごとに一つの販売先を指定してください。");
   if(command.product.imageId&&!(await c.query('SELECT 1 FROM product_image_asset WHERE id=$1',[command.product.imageId])).rowCount)throw fail("画像IDを確認してください。");
   const revision=current+1,content={product:{...command.product,workId:command.product.workId||command.product.id},reason:command.reason,offers:command.offers,appliesTo:command.appliesTo};
   await c.query('INSERT INTO product_editorial_version(id,revision,content,image_id,created_by) VALUES($1,$2,$3,$4,$5)',[command.product.id,revision,JSON.stringify(content),command.product.imageId??null,owner]);
   result={id:command.product.id,revision};
  }else throw fail("操作を確認してください。");
  await c.query('INSERT INTO product_editorial_request(request_id,owner_id,digest,result) VALUES($1,$2,$3,$4) ON CONFLICT(request_id) DO NOTHING',[command.requestId,owner,digest,JSON.stringify(result)]);return result;
 });
}
/** Retain all historical product-version references. Only never-linked uploads expire after 7 days. */
export async function collectUnusedProductImages(pool:Pool){return memberTransaction(pool,async c=>{
 if(!(await c.query("SELECT to_regclass('product_asset_maintenance') AS ready")).rows[0].ready)return 0;
 const due=await c.query("INSERT INTO product_asset_maintenance VALUES(true,clock_timestamp()) ON CONFLICT(singleton) DO UPDATE SET last_run=EXCLUDED.last_run WHERE product_asset_maintenance.last_run<clock_timestamp()-interval '1 day' RETURNING singleton");if(!due.rowCount)return 0;
 // Serialize GC with upload/product association so an asset cannot disappear mid-link.
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('product-editorial',0))");
 const hasThemeRefs=Boolean((await c.query("SELECT to_regclass('theme_editorial_asset_reference') AS ready")).rows[0].ready);
 const themeRetention=hasThemeRefs?" AND NOT EXISTS(SELECT 1 FROM theme_editorial_asset_reference t JOIN knowledge_missions.theme_registrations r ON r.request_id=t.request_id WHERE t.image_id=a.id AND (t.published OR r.state IN('saved','processing') OR t.created_at>clock_timestamp()-interval '7 days'))":'';
 if(hasThemeRefs)await c.query("DELETE FROM theme_editorial_asset_reference t USING knowledge_missions.theme_registrations r WHERE r.request_id=t.request_id AND NOT t.published AND r.state NOT IN('saved','processing') AND t.created_at<clock_timestamp()-interval '7 days'");
 return (await c.query("DELETE FROM product_image_asset WHERE id IN(SELECT a.id FROM product_image_asset a WHERE a.created_at<clock_timestamp()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM product_editorial_version p WHERE p.image_id=a.id)"+themeRetention+" LIMIT 100)" )).rowCount??0;
});}
export async function editorialCatalogue(pool:Pool,pins:{id:string;revision:number}[],theme:{id:string;revision:number}|null,base:ProductCatalogue){
 const catalog:ProductCatalogue={products:[...base.products],offers:[...base.offers],recommendations:[...base.recommendations]};
 for(const [order,pin] of pins.entries()){
  const v=await readEditorialProduct(pool,pin.id,pin.revision),p=productSchema.parse(v.product);
  if(p.imageId){const a=(await pool.query('SELECT a.role,a.alt,a.width,a.height,p.content AS provenance FROM product_image_asset a JOIN product_image_provenance p ON p.id=a.provenance_id WHERE a.id=$1',[p.imageId])).rows[0];if(a)p.image={url:'/api/knowledge/product-images/'+p.imageId,width:a.width,height:a.height,role:a.role,alt:a.alt,...(a.provenance.credit&&(a.provenance.creditDisplay==='public'||a.provenance.kind==='licensed'&&a.provenance.creditDisplay!=='internal')?{credit:a.provenance.credit,creditUrl:a.provenance.sourceUrl}:{})};}
  catalog.products=catalog.products.filter(old=>old.id!==p.id);catalog.products.unshift(p);
  catalog.offers=catalog.offers.filter(o=>o.productId!==p.id);catalog.offers.push(...v.offers);
  catalog.recommendations=catalog.recommendations.filter(rec=>rec.productId!==p.id);
  if(theme)catalog.recommendations.push({id:'product:'+p.id,target:{kind:'theme',id:theme.id,revision:theme.revision},productId:p.id,reason:v.reason,order,state:'public'});
  for(const t of v.appliesTo)catalog.recommendations.push({id:'product:'+p.id+':'+t.id,target:{...t,revision:1},productId:p.id,reason:v.reason,order,state:'public'});
 }
 return catalog;
}
