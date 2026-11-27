// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
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
