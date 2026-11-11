// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DiscoveryPresetBrowser from "../components/DiscoveryPresetBrowser";
import { initialCatalogFilters, presetCatalog } from "../lib/domain/discovery-preset-catalog";
const locale=vi.hoisted(()=>({value:"ja" as "ja"|"en"}));
vi.mock("../lib/client/ui-locale",()=>({useUiLocale:()=>({locale:locale.value})}));
afterEach(cleanup);
for(const language of ["ja","en"] as const){
 it(`プリセットは重複せず、直接探索と名前の選択を保つ ${language}`,()=>{
  locale.value=language;const en=language==="en",select=vi.fn(),subjects=vi.fn();
  const {container}=render(<DiscoveryPresetBrowser filters={initialCatalogFilters} onChange={vi.fn()} onSelect={select} onNames={vi.fn()} onChangeSubject={subjects} busy={false} error={null}/>);
  expect(container.querySelectorAll('[data-catalog-result="pluto"]')).toHaveLength(1);
  const pluto=presetCatalog.find(p=>p.id==="pluto")!,pattern=presetCatalog.find(p=>p.id==="other-works")!;
  const fixed=within(container.querySelector('[data-catalog-result="pluto"]') as HTMLElement),unbound=within(container.querySelector('[data-catalog-result="other-works"]') as HTMLElement);
  fireEvent.click(fixed.getByRole("button",{name:en?"View connections":"つながりを見る"}));expect(select).toHaveBeenLastCalledWith(pluto);
  fireEvent.click(fixed.getByRole("button",{name:en?"Choose a name":"名前を選ぶ"}));expect(subjects).toHaveBeenLastCalledWith(pluto);
  expect(unbound.queryByRole("button",{name:en?"View connections":"つながりを見る"})).toBeNull();
  fireEvent.click(unbound.getByRole("button",{name:en?"Choose a name":"名前を選ぶ"}));expect(select).toHaveBeenLastCalledWith(pattern);
 });
}
