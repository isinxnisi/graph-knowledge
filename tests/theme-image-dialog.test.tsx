// @vitest-environment jsdom
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import ThemeReadingHero from "../components/ThemeReadingHero";
import type {KnowledgeSnapshot,KnowledgeThemeVersion} from "../lib/domain/knowledge-foundation";
import type {ThemeReadingPresentation} from "../lib/domain/theme-reading-presentation";
const theme={id:"theme",revision:1,content:{description:"Introduction"}} as KnowledgeThemeVersion;
const snapshot={translations:[]} as unknown as KnowledgeSnapshot;
const image={id:"art",src:"/theme-assets/art.png",width:1600,height:900,alt:"Theme illustration",caption:"Caption",credit:"Credit",kind:"illustration" as const,focus:"50% 50%",checkedAt:"2026-11-16"};
const presentation={image,hook:"Question",lead:"Lead"} as ThemeReadingPresentation;
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});
 HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false;});
});
afterEach(cleanup);
function hero(p= presentation,locale="ja"){return <ThemeReadingHero theme={theme} snapshot={snapshot} presentation={p} locale={locale} onAbout={vi.fn()}/>;}
it("opens the original image without navigating and closes with the close button or Escape",()=>{
 render(hero());expect(screen.queryByRole("dialog")).toBeNull();
 const opener=screen.getByRole("button",{name:"テーマ画像を拡大"});fireEvent.click(opener);
 const dialog=screen.getByRole("dialog",{name:"テーマ画像"});expect(dialog.querySelector("img")?.getAttribute("src")).toBe(image.src);expect(dialog.textContent).toContain("Caption — Credit");
 fireEvent.click(screen.getByRole("button",{name:"閉じる"}));expect(screen.queryByRole("dialog")).toBeNull();
 fireEvent.click(opener);fireEvent(screen.getByRole("dialog"),new Event("cancel",{bubbles:false,cancelable:true}));expect(screen.queryByRole("dialog")).toBeNull();
});
it("dismisses only a backdrop click and never a drag from the image",()=>{
 render(hero());fireEvent.click(screen.getByRole("button",{name:"テーマ画像を拡大"}));
 const dialog=screen.getByRole("dialog"),art=dialog.querySelector("img")!;
 vi.spyOn(dialog,"getBoundingClientRect").mockReturnValue({left:50,top:50,right:250,bottom:250} as DOMRect);
 fireEvent.pointerDown(art,{clientX:100,clientY:100});fireEvent.click(dialog,{clientX:5,clientY:5});expect(screen.getByRole("dialog")).toBeTruthy();
 fireEvent.pointerDown(dialog,{clientX:5,clientY:5});fireEvent.click(dialog,{clientX:5,clientY:5});expect(screen.queryByRole("dialog")).toBeNull();
});
it("does not retain an enlarged or broken image when changing themes",()=>{
 const view=render(hero());fireEvent.click(screen.getByRole("button",{name:"テーマ画像を拡大"}));
 view.rerender(hero({...presentation,image:{...image,src:"/theme-assets/next.png"}},"en"));expect(screen.queryByRole("dialog")).toBeNull();
 fireEvent.error(screen.getByAltText(image.alt));expect(screen.queryByRole("button",{name:"Enlarge theme image"})).toBeNull();
 view.rerender(hero());expect(screen.getByRole("button",{name:"テーマ画像を拡大"})).toBeTruthy();
});
