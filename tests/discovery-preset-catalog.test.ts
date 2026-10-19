import { describe,it,expect } from "vitest";
import { presetCatalog,initialCatalogFilters,initialCatalogWorkspace,catalogWorkspaceSchema,findCatalogPresets,hasCatalogFilters,type PresetPopularity } from "../lib/domain/discovery-preset-catalog";
import { resolvePathPreset } from "../lib/domain/discovery-path-presets";

describe("公開KGで実行するプリセットカタログ",()=>{
 it("公開入口は対応済み5件だけとし、旧3定義と実行能力は内部に保持する",()=>{
  expect(findCatalogPresets(initialCatalogFilters).items.map(p=>p.id)).toEqual(["pluto","princeton","nbi","other-works","authored-works"]);
  for(const id of ["work-creators","co-creators","institution-bridge"]){expect(presetCatalog.some(p=>p.id===id)).toBe(true);expect(findCatalogPresets({...initialCatalogFilters,q:id}).items).toEqual([]);}
 });
 it("固定対象と再利用可能な形を分け、実行条件のkind・関係を既存モデルと一致させる",()=>{
  expect(new Set(presetCatalog.map(p=>p.id)).size).toBe(presetCatalog.length);
  expect(presetCatalog.filter(p=>p.recommended)).toHaveLength(3);
  for(const p of presetCatalog){if(p.execution.type!=="template")continue;const shape=resolvePathPreset(p.execution.path);expect(p.kind).toBe(shape.kinds[0]);expect(p.question).toBe(shape.predicate==="CONTRIBUTED_TO"?"credits":"affiliations");}
 });
 it("世界はOR、種別・関係・RoleはANDでカタログだけを絞る",()=>{
  const f={...initialCatalogFilters,worlds:["manga","science"] as ("manga"|"science")[],kind:"work" as const,question:"credits" as const};
  const found=findCatalogPresets(f).items;expect(found.length).toBeGreaterThan(1);expect(found.every(p=>p.kind==="work"&&p.question==="credits")).toBe(true);
  expect(findCatalogPresets({...f,role:"AUTHORSHIP"}).items.map(p=>p.id)).toEqual(["authored-works"]);
  expect(findCatalogPresets({...f,role:"DRAWING"}).items).toEqual([]);
  expect(presetCatalog.find(p=>p.id==="other-works")!.role).toBeNull();
 });
 it("11世界の未登録とKGの0件を分け、全角・複数語の検索も扱う",()=>{
  expect(findCatalogPresets({...initialCatalogFilters,worlds:["film"]}).items).toEqual([]);
  expect(findCatalogPresets({...initialCatalogFilters,q:"ＰＬＵＴＯ 著者"}).items.map(p=>p.id)).toEqual(["pluto"]);
 });
 it("新着は実装の追加日で安定し、人気未集計では説明可能な優先順へ戻す",()=>{
  const recommended=findCatalogPresets(initialCatalogFilters).items.map(p=>p.id);
  const popular=findCatalogPresets({...initialCatalogFilters,sort:"popular"});expect(popular.popularityMeasured).toBe(false);expect(popular.items.map(p=>p.id)).toEqual(recommended);
  const newest=findCatalogPresets({...initialCatalogFilters,sort:"newest"}).items;expect(newest[0].introducedAt).toBe("2026-10-18");expect(newest.at(-1)!.introducedAt).toBe("2026-10-17");
 });
 it("将来の実測値は全カタログを同じ窓で集計した場合だけ順位に使う",()=>{
  const stats:PresetPopularity={metric:"preset-starts",windowStart:"2026-10-18",windowEnd:"2026-10-19",asOf:"2026-10-19",counts:Object.fromEntries(presetCatalog.map(p=>[p.id,p.id==="authored-works"?10:0]))};
  expect(findCatalogPresets({...initialCatalogFilters,sort:"popular"},stats).items[0].id).toBe("authored-works");
  expect(findCatalogPresets(initialCatalogFilters,{...stats,counts:{pluto:999}}).popularityMeasured).toBe(false);
 });
 it("検索フィルター・並び順・戻り位置・選択状態を独立して保存し、不正な復元を拒否する",()=>{
  const snapshot={...initialCatalogWorkspace,filters:{...initialCatalogFilters,worlds:["science"],sort:"newest"},scroll:480,mode:"explore",active:"institution-bridge",reader:"paths"};
  expect(catalogWorkspaceSchema.parse(snapshot)).toEqual(snapshot);
  expect(catalogWorkspaceSchema.safeParse({...snapshot,scroll:-1}).success).toBe(false);
  expect(hasCatalogFilters(initialCatalogFilters)).toBe(false);expect(hasCatalogFilters({...initialCatalogFilters,worlds:["science"]})).toBe(true);
 });
});
