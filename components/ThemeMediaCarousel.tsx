"use client";
import {useEffect,useId,useRef,useState} from "react";
import Image from "next/image";
import {positionKey,slidesAt,type MediaLanguage,type MediaPosition,type MediaSlide,type VideoEdition} from "../lib/domain/theme-media";
import css from "./ThemeMediaCarousel.module.css";

type ThemePin={id:string;revision:number};
const none:MediaSlide[]=[];
export function usePublishedThemeMedia(theme:ThemePin|undefined,language:MediaLanguage){
  const query=theme?new URLSearchParams({themeId:theme.id,revision:String(theme.revision),language}).toString():"";
  const [loaded,setLoaded]=useState<{query:string;slides:MediaSlide[]}|null>(null);
  useEffect(()=>{
    if(!query)return;
    const controller=new AbortController();
    fetch("/api/knowledge/theme-media?"+query,{signal:controller.signal,cache:"no-store"})
      .then(async r=>{if(!r.ok)throw Error();return r.json();})
      .then(v=>{if(!controller.signal.aborted)setLoaded({query,slides:Array.isArray(v.slides)?v.slides:[]});})
      .catch(()=>{if(!controller.signal.aborted)setLoaded({query,slides:[]});});
    return ()=>controller.abort();
  },[query]);
  return {slides:loaded?.query===query?loaded.slides:none,query};
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
    let stopped=false,player:Player|undefined;
    const timer=window.setTimeout(()=>{if(!stopped)setState("failed");},15000);
    playerLibrary().then(yt=>{
      if(stopped||!box.current)return;
      const node=document.createElement("div");box.current.replaceChildren(node);
      player=new yt.Player(node,{videoId:edition.videoId,host:"https://www.youtube-nocookie.com",width:"100%",height:"100%",
        playerVars:{autoplay:1,playsinline:1,origin:window.location.origin,hl:language},
        events:{onReady:()=>{window.clearTimeout(timer);if(!stopped){setState("playing");const frame=box.current?.querySelector("iframe");if(frame)frame.title=edition.title;}},
          onError:()=>{window.clearTimeout(timer);if(!stopped)setState("failed");}}});
    }).catch(()=>{if(!stopped)setState("failed");});
    return ()=>{stopped=true;window.clearTimeout(timer);player?.destroy();};
  },[edition.videoId,edition.title,language]);
  return <><div className={short?css.vertical:css.player} hidden={state==="failed"} ref={box}/>
    {state!=="playing"&&<p role="status">{state==="loading"?(en?"Connecting to YouTube…":"YouTubeに接続中…"):(en?"The player is unavailable.":"プレイヤーを開けませんでした。")}</p>}
    <a href={"https://www.youtube.com/watch?v="+edition.videoId} target="_blank" rel="noopener noreferrer">{en?"Watch on YouTube":"YouTubeで見る"} ↗</a></>;
}
function ShortDialog({edition,language,close}:{edition:VideoEdition;language:MediaLanguage;close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=dialog.current;d?.showModal();return ()=>d?.close();},[]);
  return <dialog className={css.dialog} ref={dialog} aria-label={edition.title} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===dialog.current)close();}}>
    <div><button onClick={close} autoFocus>{language==="en"?"Close":"閉じる"}</button><YouTubeView edition={edition} short language={language}/></div>
  </dialog>;
}
function Viewer({slides,initial,query,language,preview}:{slides:MediaSlide[];initial:number;query:string;language:MediaLanguage;preview:boolean}){
  const [index,setIndex]=useState(initial),[editionChoice,setEdition]=useState<MediaLanguage>(),[playing,setPlaying]=useState(false),[broken,setBroken]=useState("");
  const owner=useId(),en=language==="en",s=slides[index]??slides[0];
  useEffect(()=>{const stop=(e:Event)=>{if((e as CustomEvent).detail!==owner)setPlaying(false);};window.addEventListener("plunode-theme-play",stop);return ()=>window.removeEventListener("plunode-theme-play",stop);},[owner]);
  const go=(next:number)=>{setIndex(next);setPlaying(false);setEdition(undefined);};
  const l=s.kind==="video"?(editionChoice&&s.editions[editionChoice]?editionChoice:s.editions[language]?language:s.editions.ja?"ja":"en"):language;
  const e=s.kind==="video"?s.editions[l]:null;
  const start=()=>{window.dispatchEvent(new CustomEvent("plunode-theme-play",{detail:owner}));setPlaying(true);};
  return <section className={css.carousel} aria-label={en?"Theme media":"テーマの映像と画像"} aria-roledescription={en?"carousel":"カルーセル"}>
    {s.kind==="image"?<figure className={css.figure}>
      <Image unoptimized src={s.image.src} width={s.image.width} height={s.image.height} alt={s.image.alt} style={{objectPosition:s.image.focus}}/>
      <figcaption>{[s.image.caption,s.image.credit].filter(Boolean).join(" · ")} {s.image.sourceUrl&&<a href={s.image.sourceUrl} target="_blank" rel="noopener noreferrer">{en?"Source":"出典"}</a>} {s.image.termsUrl&&<a href={s.image.termsUrl} target="_blank" rel="noopener noreferrer">{en?"Usage terms":"利用条件"}</a>}</figcaption>
    </figure>:e&&<div>
      {playing&&s.format==="landscape"?<YouTubeView key={e.videoId} edition={e} short={false} language={language}/>:<button type="button" className={css.play} data-short={s.format==="short"} onClick={start}>
        {e.thumbnail&&broken!==e.videoId&&<Image unoptimized width={480} height={360} src={preview?e.thumbnail:"/api/knowledge/theme-media/poster?"+query+"&id="+encodeURIComponent(e.videoId)} alt="" onError={()=>setBroken(e.videoId)}/>}
        <span className={css.symbol} aria-hidden="true">▶</span><span><small>{s.format==="short"?"YouTube Shorts":"YouTube"} · {Math.floor(e.duration/60)}:{String(Math.floor(e.duration%60)).padStart(2,"0")}</small>
        <strong lang={l}>{e.title}</strong>{l===language?(en?"Play video":"動画を再生"):(l==="ja"?(en?"Watch in Japanese":"日本語版を観る"):(en?"Watch in English":"英語版を観る"))}</span>
      </button>}
      {playing&&s.format==="short"&&<ShortDialog edition={e} language={language} close={()=>setPlaying(false)}/>}
      {s.editions.ja&&s.editions.en&&<div className={css.languages} aria-label={en?"Video language":"動画の言語"}>{(["ja","en"] as const).map(k=><button key={k} lang={k} aria-pressed={k===l} onClick={()=>{setEdition(k);setPlaying(false);}}>{k==="ja"?"日本語":"English"}</button>)}</div>}
    </div>}
    {slides.length>1&&<nav aria-label={en?"Media navigation":"メディアを送る"} className={css.nav}>
      <button aria-label={en?"Previous slide":"前のスライド"} onClick={()=>go((index+slides.length-1)%slides.length)}>←</button>
      <span aria-live="polite">{index+1} / {slides.length}</span>
      <button aria-label={en?"Next slide":"次のスライド"} onClick={()=>go((index+1)%slides.length)}>→</button></nav>}
  </section>;
}
export default function ThemeMediaCarousel({slides,query,position,language,preview=false}:{slides:MediaSlide[];query:string;position:MediaPosition;language:MediaLanguage;preview?:boolean}){
  const {items,first}=slidesAt(slides,position,language);
  if(!items.length)return null;
  return <Viewer key={[query,positionKey(position),...items.map(v=>v.id)].join("|")} slides={items} initial={first} query={query} language={language} preview={preview}/>;
}
