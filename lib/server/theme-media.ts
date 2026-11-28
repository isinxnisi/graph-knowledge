import {createHash,timingSafeEqual} from "node:crypto";
import type {Pool} from "pg";
import type {KnowledgeThemeRead} from "../domain/knowledge-theme-reader";
import {mediaSlot,positionKey,type ImageCandidate,type MediaChange,type MediaLanguage,type MediaPosition,type MediaSlide,type MediaSlot,type VideoEdition} from "../domain/theme-media";
import {themeReadingPresentation} from "./theme-reading-presentation";
import type {ThemeReadingImage} from "../domain/theme-reading-presentation";
import {memberTransaction} from "./member/operations";
import {MediaProblem} from "./theme-media-youtube";

const languages=["ja","en"] as const;
type Provenance={kind:string;terms?:string;credit?:string;creditDisplay?:string;sourceUrl?:string};
const secureUrl=(s?:string)=>{try{const u=new URL(s??"");return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}};
export function scopedActor(headers:Headers,origin:string){
  const authorization=headers.get("authorization");
  if(!authorization)return null;
  const environment=origin==="https://plunode.net"?"production":origin==="https://graph-beta.isinxnisi.com"?"beta":null;
  const token=process.env.PLUNODE_THEME_MEDIA_TOKEN;
  if(!environment||environment!==process.env.PLUNODE_THEME_MEDIA_ENVIRONMENT||headers.get("x-plunode-media-environment")!==environment||
    !token||token.length<32||!timingSafeEqual(createHash("sha256").update(authorization).digest(),createHash("sha256").update("Bearer "+token).digest())){
    throw new MediaProblem(403,"BRIDGE_DENIED","掲載先と掲載専用の接続設定が一致しません。");
  }
  return "studio:"+environment;
}

export function themeMediaImages(read:KnowledgeThemeRead,provenance:Map<string,Provenance>){
  const candidates=new Map<string,ImageCandidate>();
  const sources=new Map<string,string>();
  for(const language of languages){
    const p=themeReadingPresentation(read.theme,language,read.snapshot);
    for(const img of [p?.image,...(p?.records.map(r=>r.image)??[])]){
      if(!img)continue;
      const pin=sources.get(img.src)??img.id;
      sources.set(img.src,pin);
      const profile=provenance.get(img.id);
      const internallyProduced=profile?.kind==="original"||profile?.kind==="generated";
      const legacyGenerated=img.src.startsWith("/theme-assets/")&&img.credit.startsWith("Plunode · AI");
      const coverOnly=p?.image?.src===img.src&&
        (profile?.kind==="generated"||legacyGenerated||/^Plunode\s*Original\b/i.test(profile?.credit||img.credit));
      const existing=candidates.get(pin);
      if(existing){
        if(!existing.images[language])existing.images[language]={...img,credit:img.credit||existing.images.ja?.credit||"",sourceUrl:img.sourceUrl||existing.images.ja?.sourceUrl};
        if(coverOnly)existing.coverOnly=true;
        continue;
      }
      const licensed=profile?.kind==="licensed"&&secureUrl(profile.sourceUrl)&&!!profile.terms?.trim()&&
        !!profile.credit?.trim()&&profile.creditDisplay!=="internal";
      const catalogued=img.src.startsWith("/theme-assets/")&&img.kind==="photo"&&secureUrl(img.sourceUrl)&&secureUrl(img.termsUrl)&&!!img.credit;
      const own=internallyProduced&&!!profile.terms?.trim()||legacyGenerated;
      const image:ThemeReadingImage=licensed?{...img,sourceUrl:profile!.sourceUrl,credit:profile!.credit!}:img;
      candidates.set(pin,{id:pin,images:{[language]:image},origin:licensed||catalogued?"licensed":own?"original":"unknown",
        eligible:Boolean(licensed||catalogued||own),...(coverOnly?{coverOnly:true}:{}),...(profile?.terms?{terms:profile.terms}: {})});
    }
  }
  return [...candidates.values()];
}

export async function mediaImages(pool:Pool,read:KnowledgeThemeRead){
  const ids=languages.flatMap(l=>{
    const p=themeReadingPresentation(read.theme,l,read.snapshot);
    return [p?.image,...p?.records.map(r=>r.image)??[]].flatMap(image=>image?.src.startsWith("/api/knowledge/product-images/")?[image.id]:[]);
  });
  const rows=ids.length?(await pool.query("SELECT a.id,p.content FROM product_image_asset a JOIN product_image_provenance p ON p.id=a.provenance_id WHERE a.id=ANY($1::text[])",[[...new Set(ids)]])).rows:[];
  return themeMediaImages(read,new Map(rows.map(r=>[r.id,r.content])));
}

export function mediaTargets(read:KnowledgeThemeRead){
  return [
    {kind:"theme" as const,label:read.theme.content.title},
    ...read.snapshot.entities.map(e=>({kind:"entity" as const,id:e.id,revision:e.revision,label:e.content.name})),
    ...read.snapshot.records.map(r=>({kind:"record" as const,id:r.id,revision:r.revision,label:r.content.assertion})),
  ];
}

export function validatePlacement(slots:MediaSlot[],targets:MediaPosition[],images:ImageCandidate[],videos:Map<string,VideoEdition>,previous:MediaSlot[]=[]){
  const valid=new Set(targets.map(positionKey));
  for(const s of slots){
    if(s.positions.some(p=>!valid.has(positionKey(p))))throw new MediaProblem(409,"TARGET_CHANGED","掲載対象のノードがこの公開版に含まれていません。公開版を読み直してください。");
    if(s.kind==="image"){
      const image=images.find(i=>i.id===s.imageId);
      if(!image?.eligible)throw new MediaProblem(409,"IMAGE_UNAVAILABLE","画像の由来・出典・表示条件を確認して選び直してください。");
      if(image.coverOnly&&!removalOnly([s],previous))throw new MediaProblem(409,"IMAGE_COVER_ONLY","テーマの表紙用に制作した画像は掲載スライドに追加できません。");
    }
    if(s.kind==="video")for(const l of languages){
      const e=s.editions[l];
      if(!e||videos.has(l+":"+e.videoId))continue;
      // Keep existing associations editable when another edition has since become unavailable.
      const old=previous.find(p=>p.id===s.id);
      if(old?.kind==="video"&&old.editions[l]?.videoId===e.videoId&&s.positions.every(p=>old.positions.some(v=>positionKey(v)===positionKey(p))))continue;
      throw new MediaProblem(409,"VIDEO_UNAVAILABLE","動画の言語別チャンネル、処理完了、公開範囲、埋め込み許可を確認してください。");
    }
  }
}
export function projectSlides(slots:MediaSlot[],language:MediaLanguage,targets:MediaPosition[],images:ImageCandidate[],videos:Map<string,VideoEdition>):MediaSlide[]{
  const allowed=new Set(targets.map(positionKey));
  const slides:MediaSlide[]=[];
  for(const slot of slots){
    const positions=slot.positions.filter(p=>allowed.has(positionKey(p)));
    if(!positions.length)continue;
    if(slot.kind==="image"){
      const image=images.find(c=>c.eligible&&c.id===slot.imageId)?.images[language];
      if(image)slides.push({id:slot.id,kind:"image",image,positions});
    }else{
      const editions:Partial<Record<MediaLanguage,VideoEdition>>={};
      for(const l of languages){
        const e=slot.editions[l]&&videos.get(l+":"+slot.editions[l]!.videoId);
        if(e)editions[l]=e;
      }
      if(Object.keys(editions).length)slides.push({id:slot.id,kind:"video",format:slot.format,editions,positions});
    }
  }
  return slides;
}

type Db=Pick<Pool,"query">;
export async function settings(db:Db,id:string,revision:number){
  const row=(await db.query("SELECT generation,slots FROM site_theme_media WHERE theme_id=$1 AND theme_revision=$2",[id,revision])).rows[0];
  return {generation:row?.generation??0,slots:mediaSlot.array().parse(row?.slots??[])};
}
export async function placementHistory(db:Db,id:string){
  return (await db.query("SELECT theme_revision AS revision,generation,jsonb_array_length(slots) AS count FROM site_theme_media WHERE theme_id=$1 ORDER BY theme_revision DESC",[id])).rows
    .map(r=>({revision:Number(r.revision),generation:Number(r.generation),slotCount:Number(r.count)}));
}
export function removalOnly(after:MediaSlot[],before:MediaSlot[]){
  return after.every(slot=>{
    const previous=before.find(s=>s.id===slot.id);
    if(!previous||previous.kind!==slot.kind||slot.positions.some(p=>!previous.positions.some(v=>positionKey(v)===positionKey(p))))return false;
    if(slot.kind==="image")return previous.kind==="image"&&slot.imageId===previous.imageId;
    return previous.kind==="video"&&previous.format===slot.format&&languages.every(l=>!slot.editions[l]||slot.editions[l]?.videoId===previous.editions[l]?.videoId);
  });
}
const digest=(change:MediaChange)=>createHash("sha256").update(JSON.stringify(change)).digest("hex");
export async function mediaReceipt(db:Db,actor:string,change:MediaChange){
  const row=(await db.query("SELECT actor,digest,generation FROM site_theme_media_receipt WHERE request_id=$1",[change.requestId])).rows[0];
  if(!row)return null;
  if(row.actor!==actor||row.digest!==digest(change))throw new MediaProblem(409,"REQUEST_REUSED","同じ操作IDに異なる変更を送信しました。掲載設定を読み直してください。");
  return {generation:Number(row.generation),replayed:true};
}
export async function savePlacement(pool:Pool,actor:string,change:MediaChange,reauthorize:()=>Promise<void>){
  return memberTransaction(pool,async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["site-theme-media-request:"+change.requestId]);
    const replay=await mediaReceipt(db,actor,change);
    if(replay)return replay;
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["site-theme-media:"+change.themeId+":"+change.revision]);
    const before=await settings(db,change.themeId,change.revision);
    if(before.generation!==change.expectedGeneration)throw new MediaProblem(409,"PLACEMENT_CHANGED","ほかの変更が保存されています。掲載設定を読み直してください。");
    await reauthorize();
    const generation=before.generation+1,slots=JSON.stringify(change.slots);
    await db.query(`INSERT INTO site_theme_media(theme_id,theme_revision,generation,slots) VALUES($1,$2,$3,$4)
      ON CONFLICT(theme_id,theme_revision) DO UPDATE SET generation=excluded.generation,slots=excluded.slots,updated_at=now()`,[change.themeId,change.revision,generation,slots]);
    await db.query(`INSERT INTO site_theme_media_receipt(request_id,actor,digest,theme_id,theme_revision,generation,before_slots,after_slots)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[change.requestId,actor,digest(change),change.themeId,change.revision,generation,JSON.stringify(before.slots),slots]);
    return {generation,replayed:false};
  });
}
