"use client";
import {useEffect,useId,useLayoutEffect,useRef,useState} from "react";
import Image from "next/image";
import type {KnowledgeThemeRead} from "../lib/domain/knowledge-theme-reader";
import {positionKey,slidesAt,type MediaLanguage,type MediaPosition,type MediaSlide,type VideoEdition} from "../lib/domain/theme-media";
import {useDialogBackdrop} from "../lib/client/use-dialog-backdrop";
import {useModalViewport} from "../lib/client/use-modal-viewport";
import DialogCloseButton from "./DialogCloseButton";
import css from "./ThemeMediaCarousel.module.css";

const none:MediaSlide[]=[];
export function publishedThemeMedia(read:KnowledgeThemeRead|undefined,language:MediaLanguage){
  if(!read||read.operatorPreview||read.publishedMedia?.language!==language)return {slides:none,query:""};
  const {id,revision}=read.theme;
  const query=new URLSearchParams({themeId:id,revision:String(revision),language}).toString();
  return {slides:read.publishedMedia.slides,query};
}

type Player={destroy:()=>void};
type YouTube={Player:new(element:HTMLElement,options:object)=>Player};
let youtubeReady:Promise<YouTube>|undefined;
function playerLibrary(){
  const host=window as Window&{YT?:YouTube;onYouTubeIframeAPIReady?:()=>void};
  if(host.YT?.Player)return Promise.resolve(host.YT);
  if(!youtubeReady)youtubeReady=new Promise<YouTube>((resolve,reject)=>{
    const script=document.createElement("script"),previous=host.onYouTubeIframeAPIReady;
    const fail=()=>{window.clearTimeout(timeout);script.remove();host.onYouTubeIframeAPIReady=previous;youtubeReady=undefined;reject(Error("YouTube unavailable"));};
    const timeout=window.setTimeout(fail,10_000);
    host.onYouTubeIframeAPIReady=()=>{
      previous?.();
      if(!host.YT?.Player){fail();return;}
      window.clearTimeout(timeout);host.onYouTubeIframeAPIReady=previous;resolve(host.YT);
    };
    script.src="https://www.youtube.com/iframe_api";script.onerror=fail;document.head.appendChild(script);
  });
  return youtubeReady;
}
function YouTubeView({edition,language,short}:{edition:VideoEdition;language:MediaLanguage;short:boolean}){
  const box=useRef<HTMLDivElement>(null),[state,setState]=useState<"loading"|"playing"|"failed">("loading");
  const en=language==="en";
  useEffect(()=>{
    const mount=box.current;
    if(!mount)return;
    let active=true,player:Player|undefined;
    const dispose=()=>{
      if(!active)return;
      active=false;
      window.clearTimeout(timer);
      player?.destroy();
      mount.replaceChildren();
    };
    const fail=()=>{
      if(!active)return;
      dispose();
      setState("failed");
    };
    const timer=window.setTimeout(fail,15_000);
    playerLibrary().then(yt=>{
      if(!active)return;
      const node=document.createElement("div");
      mount.replaceChildren(node);
      const created=new yt.Player(node,{videoId:edition.videoId,host:"https://www.youtube-nocookie.com",width:"100%",height:"100%",
        playerVars:{autoplay:1,playsinline:1,origin:window.location.origin,hl:language},
        events:{onReady:()=>{
          if(!active)return;
          window.clearTimeout(timer);
          const iframe=mount.querySelector("iframe");
          if(iframe)iframe.title=edition.title;
          setState("playing");
        },onError:fail}});
      if(active)player=created;
      else created.destroy();
    }).catch(fail);
    return dispose;
  },[edition.videoId,edition.title,language]);

  return <>
    <div className={`${css.playerFrame} ${short?css.vertical:css.player}`}>
      <div className={css.playerMount} ref={box}/>
      {state!=="playing"&&<p className={css.playbackStatus} role="status">
        {state==="loading"?(en?"Connecting to YouTube…":"YouTubeに接続中…"):(en?"The player is unavailable.":"プレイヤーを開けませんでした。")}
      </p>}
    </div>
    <a className={css.youtubeLink} href={"https://www.youtube.com/watch?v="+edition.videoId} target="_blank" rel="noopener noreferrer">
      {en?"Watch on YouTube":"YouTubeで見る"} ↗
    </a>
  </>;
}

function VideoDialog({edition,language,short,close}:{edition:VideoEdition;language:MediaLanguage;short:boolean;close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useModalViewport(dialog);
  useLayoutEffect(()=>{
    const element=dialog.current;
    element?.showModal();
    return()=>{if(element?.open)element.close();};
  },[]);
  const dismiss=()=>{dialog.current?.close();close();};
  const backdrop=useDialogBackdrop(dismiss);
  return <dialog className={short?css.dialog:`${css.dialog} ${css.wideDialog}`} ref={dialog} aria-label={edition.title}
    onCancel={event=>{event.preventDefault();dismiss();}} {...backdrop}>
    <div className={css.dialogControls}><DialogCloseButton label={language==="en"?"Close":"閉じる"} onClick={dismiss}/></div>
    <YouTubeView key={edition.videoId} edition={edition} short={short} language={language}/>
  </dialog>;
}
function Viewer({slides,initial,query,language,preview,opening}:{slides:MediaSlide[];initial:number;query:string;language:MediaLanguage;preview:boolean;opening:boolean}){
  const [index,setIndex]=useState(initial),[editionChoice,setEdition]=useState<MediaLanguage>(),[playing,setPlaying]=useState(false);
  const [broken,setBroken]=useState<Set<string>>(()=>new Set());
  const owner=useId(),en=language==="en",s=slides[index]??slides[0];
  useEffect(()=>{const stop=(e:Event)=>{if((e as CustomEvent).detail!==owner)setPlaying(false);};window.addEventListener("plunode-theme-play",stop);return ()=>window.removeEventListener("plunode-theme-play",stop);},[owner]);
  const go=(next:number)=>{setIndex(next);setPlaying(false);setEdition(undefined);};
  const l=s.kind==="video"?(editionChoice&&s.editions[editionChoice]?editionChoice:s.editions[language]?language:s.editions.ja?"ja":"en"):language;
  const e=s.kind==="video"?s.editions[l]:null;
  const start=()=>{window.dispatchEvent(new CustomEvent("plunode-theme-play",{detail:owner}));setPlaying(true);};
  const markBroken=(src:string)=>setBroken(previous=>new Set(previous).add(src));
  const poster=(video:VideoEdition|null|undefined)=>video?.thumbnail?(preview?video.thumbnail:"/api/knowledge/theme-media/poster?"+query+"&id="+encodeURIComponent(video.videoId)):undefined;
  const src=poster(e);
  const thumbnail=src&&!broken.has(src)&&<Image unoptimized width={480} height={360} src={src} alt="" onError={()=>markBroken(src)}/>;
  const watchLabel=l===language?(en?"Play video":"動画を再生"):(l==="ja"?(en?"Watch in Japanese":"日本語版を観る"):(en?"Watch in English":"英語版を観る"));
  const duration=e&&`${Math.floor(e.duration/60)}:${String(Math.floor(e.duration%60)).padStart(2,"0")}`;
  const short=s.kind==="video"&&s.format==="short";
  const dialog=e&&playing&&(opening||short)&&<VideoDialog edition={e} language={language} short={short} close={()=>setPlaying(false)}/>;
  const languages=s.kind==="video"&&s.editions.ja&&s.editions.en&&<div className={css.languages} aria-label={en?"Video language":"動画の言語"}>{(["ja","en"] as const).map(k=><button key={k} lang={k} aria-pressed={k===l} onClick={()=>{setEdition(k);setPlaying(false);}}>{k==="ja"?"日本語":"English"}</button>)}</div>;
  const photo=s.kind==="image"?s.image:null;
  const imageCredit=photo&&<>{[photo.caption,photo.credit].filter(Boolean).join(" · ")} {photo.sourceUrl&&<a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">{en?"Source":"出典"}</a>} {photo.termsUrl&&<a href={photo.termsUrl} target="_blank" rel="noopener noreferrer">{en?"Usage terms":"利用条件"}</a>}</>;
  const nextIndex=(index+1)%slides.length;
  const navigation=slides.length>1&&<nav aria-label={en?"Media navigation":"メディアを送る"} className={css.nav}>
    <button type="button" aria-label={en?"Previous slide":"前のスライド"} onClick={()=>go((index+slides.length-1)%slides.length)}>{opening?"‹":"←"}</button>
    <span aria-live="polite">{index+1} / {slides.length}</span>
    <button type="button" className={opening?css.openingNext:undefined} aria-label={en?"Next slide":"次のスライド"} onClick={()=>go(nextIndex)}>{opening?"›":"→"}</button></nav>;
  if(opening){
    const next=slides.length>1?slides[nextIndex]:undefined;
    const nextPhoto=next?.kind==="image"?next.image:null;
    const nextPoster=next?.kind==="video"?poster(next.editions[language]??next.editions.ja??next.editions.en):undefined;
    const peek=nextPhoto?.src??nextPoster??"";
    return <section className={css.opening} aria-label={en?"Theme media":"テーマの映像と画像"} aria-roledescription={en?"carousel":"カルーセル"}>
      <div className={css.openingLayout} data-peek={!!peek}>
        <div className={css.openingVisual}>
          {photo?<figure className={css.openingFigure}>
            <Image unoptimized src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} style={{objectPosition:photo.focus}}/>
            <figcaption>{imageCredit}</figcaption>
          </figure>:e&&<>
            <button type="button" className={css.openingPoster} data-short={short} aria-haspopup="dialog" aria-label={`${watchLabel}: ${e.title}`} onClick={start}>
              {thumbnail}<span className={css.openingPlay} aria-hidden="true">▶</span>
            </button>
            <div className={css.openingCaption}><strong lang={l}>{e.title}</strong><small>{short?"Shorts · ":""}{duration}</small></div>
            {l!==language&&<small className={css.openingAlternate}>{watchLabel}</small>}
            {languages}
          </>}
        </div>
        {peek&&<div className={css.openingPeek} aria-hidden="true">
          {!broken.has(peek)&&<Image unoptimized src={peek} width={nextPhoto?.width??480} height={nextPhoto?.height??360} alt="" style={{objectPosition:nextPhoto?.focus}} onError={()=>markBroken(peek)}/>}
        </div>}
        {navigation}
      </div>
      {dialog}
    </section>;
  }
  return <section className={css.carousel} aria-label={en?"Theme media":"テーマの映像と画像"} aria-roledescription={en?"carousel":"カルーセル"}>
    {photo?<figure className={css.figure}>
      <Image unoptimized src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} style={{objectPosition:photo.focus}}/>
      <figcaption>{imageCredit}</figcaption>
    </figure>:e&&<div>
      {playing&&!short?<YouTubeView key={e.videoId} edition={e} short={false} language={language}/>:<button type="button" className={css.play} data-short={short} aria-haspopup={short?"dialog":undefined} onClick={start}>
        {thumbnail}<span className={css.symbol} aria-hidden="true">▶</span><span><small>{short?"YouTube Shorts":"YouTube"} · {duration}</small>
        <strong lang={l}>{e.title}</strong>{watchLabel}</span>
      </button>}
      {dialog}{languages}
    </div>}
    {navigation}
  </section>;
}
export default function ThemeMediaCarousel({slides,query,position,language,preview=false,variant}:{slides:MediaSlide[];query:string;position:MediaPosition;language:MediaLanguage;preview?:boolean;variant?:"opening"}){
  const {items,first}=slidesAt(slides,position,language);
  if(!items.length)return null;
  return <Viewer key={[query,positionKey(position),...items.map(v=>v.id)].join("|")} slides={items} initial={first} query={query} language={language} preview={preview} opening={variant==="opening"}/>;
}
