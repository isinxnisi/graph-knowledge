import { test, expect } from "@playwright/test";
test("scroll checkpoints avoid a WebKit-style History limit; idle and tab resume do not repeat search",async({browser},info)=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await ctx.addInitScript(()=>{
  localStorage.setItem("plunode:privacy:v1",'{"analytics":false,"ads":false}');
  const stats:{calls:number[];enabled:boolean;errors:string[];encodes:number}={calls:[],enabled:false,errors:[],encodes:0};(window as unknown as {probe:typeof stats}).probe=stats;
  const replace=history.replaceState.bind(history),encode=btoa;
  window.btoa=s=>{stats.encodes++;return encode(s);};
  history.replaceState=(data,unused,url)=>{if(stats.enabled){const now=Date.now();stats.calls.push(now);if(stats.calls.filter(t=>now-t<10000).length>100)throw new DOMException("WebKit-style history frequency limit","SecurityError");}return replace(data,unused,url);};
  window.addEventListener("unhandledrejection",event=>stats.errors.push(String(event.reason)));window.addEventListener("error",event=>stats.errors.push(event.message));
 });
 const page=await ctx.newPage(),errors:string[]=[],requests:string[]=[];page.on("pageerror",error=>errors.push(error.message));page.on("request",r=>{if(r.method()==="POST"&&r.url().endsWith("/api/discovery/entities"))requests.push(r.postData()!);});
 await page.goto(info.project.use.baseURL!+"/?discovery=presets");await page.getByTestId("discovery-search-entry").click();await page.getByRole("button",{name:"対象を探す",exact:true}).click();await expect(page.locator("[data-target-id]")).toHaveCount(20);
 await page.evaluate(()=>{const p=(window as unknown as {probe:{calls:number[];enabled:boolean;encodes:number}}).probe;p.calls=[];p.enabled=true;p.encodes=0;});
 await page.getByTestId("prototype-body").evaluate(async el=>{const start=performance.now();await new Promise<void>(resolve=>{const frame=()=>{el.scrollTop=100+Math.round((1+Math.sin((performance.now()-start)/140))*250);if(performance.now()-start<6500)requestAnimationFrame(frame);else resolve();};frame();});});
 await expect(page.getByTestId("discovery-connections")).toBeVisible();await expect.poll(()=>page.evaluate(()=>history.state?.discoveryWorkspace?.connectionFlow?.scrolls.targets)).toBeGreaterThan(0);
 const stats=await page.evaluate(()=>(window as unknown as {probe:{calls:number[];errors:string[];encodes:number}}).probe);expect(stats.calls.length).toBeLessThan(15);expect(stats.encodes).toBeLessThan(500);expect(stats.errors).toEqual([]);expect(requests).toHaveLength(1);
 const top=await page.getByTestId("prototype-body").evaluate(el=>el.scrollTop);await page.getByRole("button",{name:"プリセットを探す",exact:true}).dispatchEvent("click");await page.getByRole("button",{name:"対象を探す",exact:true}).dispatchEvent("click");await expect.poll(()=>page.getByTestId("prototype-body").evaluate(el=>el.scrollTop)).toBeCloseTo(top,0);
 // Headless tab activation does not model iOS visibility. Exercise the app's
 // hidden/visible handlers explicitly; the longer probe also freezes the page.
 const second=await ctx.newPage();await second.goto(info.project.use.baseURL!+"/?discovery=presets");await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));});
 await second.bringToFront();await page.waitForTimeout(1000);await page.bringToFront();await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("focus"));});
 const before=requests.length;await page.waitForTimeout(1500);expect(requests).toHaveLength(before);expect(errors).toEqual([]);await expect(page.getByTestId("discovery-connections")).toBeVisible();
 await ctx.close();
});
