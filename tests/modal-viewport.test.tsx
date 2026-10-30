// @vitest-environment jsdom
import { StrictMode, useRef } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useModalViewport } from "../lib/client/use-modal-viewport";
function Dialog({ name }: { name: string }) { const ref=useRef<HTMLDialogElement>(null);useModalViewport(ref);return <dialog open ref={ref} aria-label={name}><textarea aria-label={name+" draft"} defaultValue="入力を保持"/></dialog>; }
beforeEach(()=>{vi.stubGlobal("scrollTo",vi.fn());vi.stubGlobal("innerHeight",800);vi.stubGlobal("innerWidth",390);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();document.body.removeAttribute("style");document.documentElement.removeAttribute("style");});
it("keyboard resize / pan / dismissal updates the same dialog without losing draft or scrolling its content",()=>{
 const viewport=Object.assign(new EventTarget(),{width:390,height:800,offsetLeft:0,offsetTop:0,scale:1});vi.stubGlobal("visualViewport",viewport);
 const view=render(<Dialog name="Editor"/>),dialog=screen.getByRole("dialog");
 fireEvent.change(screen.getByLabelText("Editor draft"),{target:{value:"編集中の内容"}});dialog.scrollTop=120;
 Object.assign(viewport,{height:330,offsetTop:180});viewport.dispatchEvent(new Event("resize"));
 expect(dialog.style.top).toBe("345px");expect(dialog.style.getPropertyValue("--dialog-height")).toBe("330px");
 Object.assign(viewport,{offsetTop:220});viewport.dispatchEvent(new Event("scroll"));expect(dialog.style.top).toBe("385px");
 Object.assign(viewport,{height:800});viewport.dispatchEvent(new Event("resize"));
 expect(dialog.style.top).toBe("400px");expect(dialog.scrollTop).toBe(120);
 expect((screen.getByLabelText("Editor draft") as HTMLTextAreaElement).value).toBe("編集中の内容");
 view.unmount();expect(document.body.style.position).toBe("");expect(document.documentElement.style.overflow).toBe("");
});
it("nested dialogs and Strict Mode keep the page locked until the final close and restore original styles / scroll",()=>{
 vi.stubGlobal("scrollY",245);document.body.style.paddingRight="7px";document.body.style.position="relative";
 const first=render(<StrictMode><Dialog name="Library"/></StrictMode>),second=render(<Dialog name="Editor"/>);
 expect(document.body.style.top).toBe("-245px");expect(document.body.style.position).toBe("fixed");
 first.unmount();expect(document.body.style.position).toBe("fixed");
 vi.stubGlobal("scrollY",0);second.unmount();
 expect(document.body.style.position).toBe("relative");expect(document.body.style.paddingRight).toBe("7px");
 expect(window.scrollTo).toHaveBeenCalledWith({left:0,top:245,behavior:"instant"});
});
