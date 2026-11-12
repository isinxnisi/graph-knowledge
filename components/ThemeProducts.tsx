"use client";
import Image from "next/image";
import {useEffect,useState} from "react";
import type {contextualProducts} from "../lib/domain/theme-products";
import {useUiLocale} from "../lib/client/ui-locale";
import Icon from "./Icon";
import ReadingDetailSection,{ReadingList} from "./ReadingDetailSection";
import css from "./ThemeProducts.module.css";
export type ProductCardItem=ReturnType<typeof contextualProducts>[number];
type ThemeRef={id:string;revision:number};
type Selection={kind:"record"|"entity";id:string};
export function useThemeItems(theme?:ThemeRef,selection?:Selection|null){
 const [market,setMarket]=useState("JP"),[state,setState]=useState<{key:string;items:ProductCardItem[];error:boolean}>({key:"",items:[],error:false});
 const key=theme?JSON.stringify({themeId:theme.id,revision:String(theme.revision),marketplace:market,alternatives:"1",...(selection?{kind:selection.kind,id:selection.id}:{})}):"";
 useEffect(()=>{if(!key)return;const c=new AbortController();void fetch("/api/knowledge/theme-products?"+new URLSearchParams(JSON.parse(key)),{signal:c.signal}).then(async r=>{if(!r.ok)throw Error();const v=await r.json();if(!c.signal.aborted)setState({key,items:v.products,error:false});}).catch(()=>{if(!c.signal.aborted)setState({key,items:[],error:true});});return()=>c.abort();},[key]);
 return {market,onMarket:setMarket,items:state.key===key?state.items:[],error:state.key===key&&state.error};
}
export default function ThemeProducts({theme,selection=null}:{theme:ThemeRef;selection?:Selection|null}){
 const {locale}=useUiLocale();return <ThemeItemsResult result={useThemeItems(theme,selection)} en={locale==="en"}/>;
}
export function ThemeItemsResult({result,en}:{result:ReturnType<typeof useThemeItems>;en:boolean}){
 if(result.error)return <p className={css.notice}>{en?"Related items are temporarily unavailable.":"関連アイテムを一時的に読み込めません。"}</p>;
 return result.items.length?<RelatedProducts {...result} en={en}/>:null;
}
export function ItemTeaser({item,en,onOpen}:{item:ProductCardItem;en:boolean;onOpen:(button:HTMLButtonElement)=>void}){
 const {product}=item,image=product.image,[failed,setFailed]=useState(false);
 const title=product.displayName?.[en?"en":"ja"]||product.title;
 return <button type="button" className={css.teaser} onClick={e=>onOpen(e.currentTarget)}>
 {image&&!failed&&<Image unoptimized src={image.url+(image.url.startsWith("/api/knowledge/product-images/")?"?size=small":"")} alt="" width={44} height={44} onError={()=>setFailed(true)}/>}
 <span><small>{en?"Related item":"関連アイテム"}{image?.role==="illustration"&&!failed&&(en?" · Illustrative image":" ・ 紹介用イメージ")}</small><strong>{title}</strong></span><Icon name="arrow"/></button>;
}
export function RelatedProducts({items,market,onMarket,en}:{items:ProductCardItem[];market:string;onMarket:(value:string)=>void;en:boolean}){
 return <ReadingDetailSection className={css.section} title={en?"Related items":"関連アイテム"} icon="shopping" action={<div className={css.region}><span className={css.affiliation}>{en?"Amazon affiliate":"Amazonアフィリエイト"}</span><label>{en?"Store region":"購入地域"}<span className={css.regionControl}><select aria-label={en?"Store region":"購入地域"} value={market} onChange={e=>onMarket(e.target.value)}><option value="JP">{en?"Japan":"日本"}</option><option value="US">{en?"United States":"米国"}</option><option value="UK">{en?"United Kingdom":"英国"}</option></select><Icon name="chevron"/></span></label></div>}>
 <ReadingList key={market} noun={en?"items":"アイテム"} items={items.map(item=><ProductCard key={item.product.id} item={item} en={en}/>)}/>
 {items.some(i=>i.offer?.status==="ready"||i.alternatives.length>0)&&<p className={css.disclosure}>{en?"As an Amazon Associate, Plunode earns from qualifying purchases.":"Amazonのアソシエイトとして、Plunodeは適格販売により収入を得ています。"}</p>}
 </ReadingDetailSection>;
}
export function ProductCard({item,en}:{item:ProductCardItem;en:boolean}){
 const {product}=item,own=product.image,offer=item.offer?.status==="ready"?item.offer:null,providerImage=offer?.image;
 const title=product.displayName?.[en?"en":"ja"]||product.title;
 const category=product.category??(product.id.startsWith("calendar:")?"calendar":"book");
 const labels={book:en?"Book":"書籍",calendar:en?"Calendar":"カレンダー",video:en?"Video":"映像",music:en?"Music":"音楽",other:en?"Item":"アイテム"};
 return <article className={css.card} aria-label={title}><div className={css.main}>
 <figure className={css.figure}><ProductImage key={own?.url??providerImage?.url??"missing"} image={own??providerImage} title={own?.alt[en?"en":"ja"]??title} en={en}/>{(own?.role==="illustration"||own?.credit)&&<figcaption>{own.role==="illustration"&&(en?"Illustrative image":"紹介用イメージ")}{own.credit&&<span>{own.creditUrl?<a href={own.creditUrl} target="_blank" rel="noopener noreferrer">{own.credit}</a>:own.credit}</span>}</figcaption>}</figure>
 <div className={css.copy}><div className={css.identity}><h4>{title}</h4><div className={css.badges}><span>{labels[category]}</span>{product.year&&<span>{en?`${product.year} edition`:`${product.year}年版`}</span>}{product.language&&product.language!=="und"&&<span>{product.language==="en"?(en?"English":"英語版"):product.language==="ja"?(en?"Japanese":"日本語版"):product.language.toUpperCase()}</span>}</div>{product.title!==title&&<details className={css.fullTitle}><summary>{en?"Full product name":"正式な商品名"}<Icon name="chevron"/></summary><p>{product.title}</p></details>}</div><div className={css.description}><p className={css.reason}>{item.reason[en?"en":"ja"]}</p></div></div></div>
 <div className={css.purchase}>{offer?<a className={css.buy} href={offer.affiliateUrl} target="_blank" rel="sponsored noopener noreferrer">{en?"Buy on Amazon":"Amazonで購入する"}<Icon name="external"/></a>:<><p className={css.availability}>{en?"A purchase link for this region is not yet available.":"この地域の購入先はまだ確認できていません。"}</p>{item.alternatives.length>0?<details className={css.alternatives}><summary>{en?"View another store region":"他の地域の購入先を見る"}</summary>{item.alternatives.map(o=><a key={o.marketplace} className={css.buy} href={o.affiliateUrl} target="_blank" rel="sponsored noopener noreferrer">{en?"Amazon":"Amazon"} {o.marketplace=== "JP"?(en?"Japan":"日本"):o.marketplace==="US"?(en?"US":"米国"):(en?"UK":"英国")}<Icon name="external"/></a>)}</details>:<a className={css.infoLink} href={product.metadataSource} target="_blank" rel="noopener noreferrer">{en?"Product details":"商品の詳しい情報"}<Icon name="external"/></a>}</> }</div>
 </article>;
}
function ProductImage({image,title,en}:{image?:{url:string;width:number;height:number};title:string;en:boolean}){
 const [failed,setFailed]=useState(false);
 return <div className={css.imageFrame}>{image&&!failed?<Image unoptimized src={image.url+(image.url.startsWith('/api/knowledge/product-images/')?'?size=small':'')} width={image.width} height={image.height} alt={title} onError={()=>setFailed(true)}/>:<span className={css.noImage}><Icon name="image"/><span>{en?failed?"Image unavailable":"No image":failed?"画像を表示できません":"画像は準備中"}</span></span>}</div>;
}
