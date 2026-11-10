"use client";
import {useState} from "react";
import {RelatedProducts,type ProductCardItem} from "./ThemeProducts";
export default function ProductCardReview({items}:{items:ProductCardItem[]}){
 const [en,setEn]=useState(false),[market,setMarket]=useState('JP'),[policy,setPolicy]=useState('keep');
 const regional=items.map(i=>market==='JP'?i:{...i,offer:null,alternatives:i.offer?[i.offer]:[]});const shown=policy==='hide'?regional.filter(i=>i.offer):regional;
 return <main style={{maxWidth:1100,margin:'24px auto',padding:16}}><h1 style={{fontSize:20}}>商品カードの表示確認（運営専用）</h1><p>「表示試験」のカードは実商品の写真・仕様ではありません。同じカード部品を右欄相当の幅で確認します。</p><button onClick={()=>setEn(v=>!v)}>{en?'日本語':'English'}</button><fieldset style={{margin:'12px 0',maxWidth:430}}><legend>購入先がない地域の比較</legend><label style={{display:'block'}}><input type="radio" checked={policy==='keep'} onChange={()=>setPolicy('keep')}/> A 紹介を残し、別地域の購入先は開いて選ぶ</label><label style={{display:'block'}}><input type="radio" checked={policy==='hide'} onChange={()=>setPolicy('hide')}/> B この地域の購入先がある商品だけ表示</label></fieldset><div style={{maxWidth:430}}><RelatedProducts items={shown} market={market} onMarket={setMarket} en={en}/>{!shown.length&&<p>この地域の購入先はまだ確認できていません。</p>}</div></main>;
}
