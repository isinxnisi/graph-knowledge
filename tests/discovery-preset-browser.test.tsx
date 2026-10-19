// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DiscoveryPresetBrowser from "../components/DiscoveryPresetBrowser";
import { initialCatalogFilters, presetCatalog } from "../lib/domain/discovery-preset-catalog";
const locale=vi.hoisted(()=>({value:"ja" as "ja"|"en"}));
vi.mock("../lib/client/ui-locale",()=>({useUiLocale:()=>({locale:locale.value})}));
afterEach(cleanup);
for(const language of ["ja","en"] as const){
 it(`おすすめはGraphへの単一入口で、一覧の同名操作は同じ対象検索へ進む ${language}`,()=>{
  locale.value=language;const en=language==="en",select=vi.fn(),subjects=vi.fn();
  const {container}=render(<DiscoveryPresetBrowser filters={initialCatalogFilters} onChange={vi.fn()} onSelect={select} onNames={vi.fn()} onChangeSubject={subjects} busy={false} error={null}/>);
  const featured=screen.getByRole("region",{name:en?"Recommended presets":"おすすめプリセット"});
  expect(within(featured).getAllByRole("button")).toHaveLength(3);
  expect(within(featured).queryByRole("button",{name:en?"Find matching subjects":"条件に合う対象を探す"})).toBeNull();
  fireEvent.click(within(featured).getByRole("button",{name:/PLUTO/}));
  const pluto=presetCatalog.find(p=>p.id==="pluto")!,pattern=presetCatalog.find(p=>p.id==="other-works")!;
  expect(select).toHaveBeenLastCalledWith(pluto);expect(subjects).not.toHaveBeenCalled();
  const fixed=within(container.querySelector('[data-catalog-result="pluto"]') as HTMLElement),unbound=within(container.querySelector('[data-catalog-result="other-works"]') as HTMLElement);
  fireEvent.click(fixed.getByRole("button",{name:en?"Explore in Graph":"Graphで探索"}));expect(select).toHaveBeenLastCalledWith(pluto);
  fireEvent.click(fixed.getByRole("button",{name:en?"Find matching subjects":"条件に合う対象を探す"}));expect(subjects).toHaveBeenLastCalledWith(pluto);
  expect(unbound.queryByRole("button",{name:en?"Explore in Graph":"Graphで探索"})).toBeNull();
  fireEvent.click(unbound.getByRole("button",{name:en?"Find matching subjects":"条件に合う対象を探す"}));expect(select).toHaveBeenLastCalledWith(pattern);
 });
}
