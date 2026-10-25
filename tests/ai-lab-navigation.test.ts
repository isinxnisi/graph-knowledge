// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { labEntry, labEntryEvent, labExplorationPan, labRecordReturn, rememberLabDeparture, rememberLabEntry, safeLabReturn, saveLabExplorationView } from "../lib/client/ai-lab-navigation";

afterEach(()=>{sessionStorage.clear();history.replaceState(null,"","/");vi.restoreAllMocks();});
it("復帰先を同originの実装済み経路に限定し、外部URLや壊れたstorageを使わない",()=>{
  for(const value of ["/","/en","/ai-lab?run=x#records","/en/ai-lab","/member#my-capsules","/communities#discover","/operations","/explore/2b7c6289-d050-4dc0-93e3-9307681253cc?s=x"])expect(safeLabReturn(value)).toBe(true);
  for(const value of ["//evil.invalid","https://evil.invalid","/\\evil.invalid","/member-evil","/ai-lab-evil","/communities/private","/\n"])expect(safeLabReturn(value)).toBe(false);
  sessionStorage.setItem("plunode:ai-lab-entry:v1",'{"href":"//evil.invalid","scroll":1}');expect(labEntry()).toBeNull();
});
it("コミュニティ・運営からの入口を保存し、未対応の経路から古い復帰元を再利用しない",()=>{
  for(const href of ['/communities#discover','/operations']){history.replaceState(null,'',href);rememberLabEntry();expect(labEntry()?.href).toBe(href);}
  history.replaceState(null,'','/unsupported');rememberLabEntry();expect(labEntry()).toBeNull();
});
it("既存Graphのcheckpoint後に公開URLとpanだけを保存し、同じKG版への復帰でだけ再利用する",()=>{
  const href="/explore/2b7c6289-d050-4dc0-93e3-9307681253cc?s=encoded";history.replaceState(null,"",href);
  const checkpoint=vi.fn();window.addEventListener(labEntryEvent,checkpoint);rememberLabEntry();window.removeEventListener(labEntryEvent,checkpoint);
  expect(checkpoint).toHaveBeenCalledOnce();expect(labEntry()?.href).toBe(href);
  saveLabExplorationView(href,"revision-a",{pan:{x:40,y:60}});
  vi.spyOn(document,"referrer","get").mockReturnValue(location.origin+"/ai-lab");
  expect(labExplorationPan(href,"revision-a")).toEqual({x:40,y:60});expect(labExplorationPan(href,"revision-b")).toBeNull();
  vi.spyOn(document,"referrer","get").mockReturnValue("https://evil.invalid/ai-lab");expect(labExplorationPan(href,"revision-a")).toBeNull();
});
it("根拠からラボの同じ記録へ戻し、直接閲覧には架空の復帰元を出さない",()=>{
  const record="/en/ai-lab?run=public-run#records",target="/en?read=claim&dataset=public-kg&id=cc2bc0c3-d8e7-47fe-8aaf-1b219bff0137";
  history.replaceState(null,"",record);rememberLabDeparture(target);history.replaceState(null,"",target);
  vi.spyOn(document,"referrer","get").mockReturnValue(location.origin+"/en/ai-lab?run=public-run");expect(labRecordReturn()).toBe(record);
  history.replaceState(null,"","/en");expect(labRecordReturn()).toBeNull();
});
