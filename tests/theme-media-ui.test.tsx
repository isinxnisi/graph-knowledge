// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import ThemeMediaCarousel from "../components/ThemeMediaCarousel";
import type {MediaSlide} from "../lib/domain/theme-media";
const top={kind:"theme"} as const;
const video={videoId:"oneVideo001",title:"Film",duration:33,privacy:"public" as const};
const film:MediaSlide={id:"v",kind:"video",format:"landscape",positions:[top],editions:{ja:video,en:{...video,videoId:"twoVideo002",title:"English Film"}}};
const image:MediaSlide={id:"i",kind:"image",positions:[top],image:{id:"img",kind:"photo",src:"/theme-assets/img.png",width:480,height:360,credit:"Museum",focus:"50% 50%",caption:"Exhibit",checkedAt:"2026-11-28",alt:"Artifact",sourceUrl:"https://example.com/source",termsUrl:"https://example.com/terms"}};
const renderMedia=(slides:MediaSlide[],language:"ja"|"en"="ja")=>render(<ThemeMediaCarousel query="themeId=theme&revision=1" slides={slides} language={language} position={top}/>);
beforeEach(()=>{HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false;});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("keeps single/empty media quiet; shows source and credit for selected images",()=>{
 const x=renderMedia([]);expect(x.container.firstChild).toBeNull();x.unmount();
 renderMedia([image],"en");expect(screen.getByAltText("Artifact")).toBeTruthy();expect(screen.queryByRole("navigation")).toBeNull();
 expect(screen.getByRole("link",{name:"Source"}).getAttribute("href")).toBe("https://example.com/source");
 expect(screen.getByText(/Museum/)).toBeTruthy();
});
it("loads just the player requested, and destroys it when switching edition or slide",async()=>{
 const destroyed=vi.fn(),ids:string[]=[];
 vi.stubGlobal("YT",{Player:class{destroy=destroyed;constructor(el:HTMLElement,options:{videoId:string;events:{onReady:()=>void}}){ids.push(options.videoId);el.append(document.createElement("iframe"));options.events.onReady();}}});
 renderMedia([film,image]);
 expect(document.querySelector("iframe")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/動画を再生/}));await waitFor(()=>expect(ids).toEqual(["oneVideo001"]));
 fireEvent.click(screen.getByRole("button",{name:"English"}));expect(destroyed).toHaveBeenCalledOnce();expect(document.querySelector("iframe")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/English Film/}));await waitFor(()=>expect(ids).toEqual(["oneVideo001","twoVideo002"]));
 fireEvent.click(screen.getByRole("button",{name:"次のスライド"}));expect(destroyed).toHaveBeenCalledTimes(2);expect(screen.getByAltText("Artifact")).toBeTruthy();
});
it("starts with a matching landscape or image, offers the other language explicitly and opens Shorts on demand",()=>{
 const short={...film,kind:"video" as const,format:"short" as const,editions:{ja:video}};
 renderMedia([short,image],"en");expect(screen.getByAltText("Artifact")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Previous slide"}));
 const play=screen.getByRole("button",{name:/Watch in Japanese/});expect(screen.queryByRole("dialog")).toBeNull();fireEvent.click(play);
 expect(screen.getByRole("dialog")).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Close"}));expect(screen.queryByRole("dialog")).toBeNull();
});
it("opens landscape video only on demand in the opening and closes it from the backdrop or Escape",async()=>{
 const destroyed=vi.fn();
 vi.stubGlobal("YT",{Player:class{destroy=destroyed;constructor(el:HTMLElement,options:{events:{onReady:()=>void}}){el.append(document.createElement("iframe"));options.events.onReady();}}});
 render(<ThemeMediaCarousel query="themeId=theme&revision=1" slides={[film]} language="ja" position={top} variant="opening"/>);
 const play=screen.getByRole("button",{name:"動画を再生: Film"});
 expect(screen.queryByRole("navigation")).toBeNull();
 expect(document.querySelector("iframe")).toBeNull();
 fireEvent.click(play);
 await waitFor(()=>expect(screen.getByRole("dialog").querySelector("iframe")).toBeTruthy());
 const dialog=screen.getByRole("dialog");
 const close=screen.getByRole("button",{name:"閉じる"});
 expect(close.hasAttribute("data-dialog-close")).toBe(true);
 expect(close.textContent).toBe("");
 fireEvent(dialog,new MouseEvent("pointerdown",{bubbles:true,clientX:-1,clientY:-1}));
 fireEvent.click(dialog,{clientX:-1,clientY:-1});
 expect(destroyed).toHaveBeenCalledOnce();
 expect(screen.queryByRole("dialog")).toBeNull();
 fireEvent.click(play);
 await waitFor(()=>expect(screen.getByRole("dialog").querySelector("iframe")).toBeTruthy());
 fireEvent(screen.getByRole("dialog"),new Event("cancel",{cancelable:true}));
 expect(destroyed).toHaveBeenCalledTimes(2);
 expect(screen.queryByRole("dialog")).toBeNull();
});
it("keeps the playback viewport mounted while connecting, playing, and reporting an error",async()=>{
 let callbacks:{onReady:()=>void;onError:()=>void}|undefined;
 const destroyed=vi.fn();
 vi.stubGlobal("YT",{Player:class{
  destroy=destroyed;
  constructor(el:HTMLElement,options:{events:NonNullable<typeof callbacks>}){
   el.append(document.createElement("iframe"));
   callbacks=options.events;
  }
 }});
 render(<ThemeMediaCarousel query="themeId=theme&revision=1" slides={[film]} language="ja" position={top} variant="opening"/>);
 fireEvent.click(screen.getByRole("button",{name:"動画を再生: Film"}));
 const dialog=screen.getByRole("dialog"), frame=screen.getByRole("status").parentElement!;
 expect(dialog.contains(frame)).toBe(true);
 const link=screen.getByRole("link",{name:/YouTubeで見る/});
 await waitFor(()=>expect(frame.querySelector("iframe")).toBeTruthy());
 act(()=>callbacks!.onReady());
 expect(screen.queryByRole("status")).toBeNull();
 expect(dialog.contains(frame)).toBe(true);
 act(()=>callbacks!.onError());
 expect(screen.getByRole("status").parentElement).toBe(frame);
 expect(frame.hidden).toBe(false);
 expect(frame.querySelector("iframe")).toBeNull();
 expect(screen.getByRole("link",{name:/YouTubeで見る/})).toBe(link);
 expect(destroyed).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole("button",{name:"閉じる"}));
 expect(destroyed).toHaveBeenCalledOnce();
});
it("uses the next selected image as the opening peek and shows its credit when selected",()=>{
 const rendered=render(<ThemeMediaCarousel query="themeId=theme&revision=1" slides={[film,image]} language="ja" position={top} variant="opening"/>);
 const peek=rendered.container.querySelector('div[aria-hidden="true"] img[alt=""]')!;
 const reserved=peek.parentElement!;
 expect(peek.getAttribute("src")).toContain("/theme-assets/img.png");
 fireEvent.error(peek);
 expect(reserved.parentElement?.getAttribute("data-peek")).toBe("true");
 expect(reserved.querySelector("img")).toBeNull();
 expect(screen.queryByAltText("Artifact")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"次のスライド"}));
 expect(screen.getByAltText("Artifact")).toBeTruthy();
 expect(screen.getByText(/Museum/)).toBeTruthy();
 expect(screen.getByRole("link",{name:"出典"}).getAttribute("href")).toBe("https://example.com/source");
 expect(screen.getByRole("link",{name:"利用条件"}).getAttribute("href")).toBe("https://example.com/terms");
});
