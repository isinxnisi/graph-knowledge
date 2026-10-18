import { z } from "zod";
import type { EntitySummary } from "./api";
import { roleIdSchema } from "./contribution";
import { WORLD_IDS, prototypeSeeds, type WorldId, type QuestionId } from "./discovery-prototype";
import { pathPresets, type PathPresetRef } from "./discovery-path-presets";

type Text = readonly [string, string];
export type CatalogPreset = {
  id: string; title: Text; description: Text; worlds: readonly WorldId[];
  kind: EntitySummary["kind"]; question: QuestionId; role: z.infer<typeof roleIdSchema> | null;
  priority: number; introducedAt: string; recommended: boolean;
  execution: { type: "fixed"; anchorId: string } | { type: "template"; path: PathPresetRef; exampleId: string; exampleName: Text };
};
// Editorial tags describe the catalogue, never KG classification filters.
export const presetCatalog: readonly CatalogPreset[] = [
  { id:"pluto",title:["PLUTOのつくり手","Who made PLUTO?"],description:["著者・監修・プロデュース。それぞれの制作記録と出典へ。","Discover authorship, supervision and production credits, with their sources."],worlds:["manga"],kind:"work",question:"credits",role:null,priority:100,introducedAt:"2026-10-17",recommended:true,execution:{type:"fixed",anchorId:prototypeSeeds[0].id}},
  { id:"princeton",title:["Princetonの人々","People at Princeton"],description:["所属の記録から人物へ。現在の所属や同時在籍とは分けて辿ります。","Meet people through affiliation records, without assuming current or simultaneous affiliation."],worlds:["science","history"],kind:"organization",question:"affiliations",role:null,priority:90,introducedAt:"2026-10-17",recommended:true,execution:{type:"fixed",anchorId:prototypeSeeds[1].id}},
  { id:"nbi",title:["研究所で出会う","Meet through NBI"],description:["ニールス・ボーア研究所と人物を結ぶ、歴史の中の所属記録へ。","Explore historical affiliation records connecting people with the Niels Bohr Institute."],worlds:["science","history"],kind:"organization",question:"affiliations",role:null,priority:80,introducedAt:"2026-10-17",recommended:true,execution:{type:"fixed",anchorId:prototypeSeeds[2].id}},
  ...pathPresets.map((preset,i):CatalogPreset=>({id:preset.id,title:preset.title,description:preset.purpose,worlds:preset.predicate==="CONTRIBUTED_TO"?["manga"]:["science","history"],kind:preset.kinds[0],question:preset.predicate==="CONTRIBUTED_TO"?"credits":"affiliations",role:null,priority:70-i,introducedAt:"2026-10-18",recommended:false,execution:{type:"template",path:{id:preset.id,revision:1},exampleId:preset.id==="co-creators"?"d900543a-9c11-48c1-be76-1822b756fcc4":preset.id==="institution-bridge"?prototypeSeeds[2].id:prototypeSeeds[0].id,exampleName:preset.id==="co-creators"?["浦沢直樹","Naoki Urasawa"]:preset.id==="institution-bridge"?["研究所","NBI"]:["PLUTO","PLUTO"]}})),
  {id:"authored-works",title:["著者の記録から別作品へ","Other works through authorship"],description:["各段に著者Roleがある記録だけで、同じ著者の別作品を辿ります。","Follow only Claims carrying the authorship Role at every step to another work."],worlds:["manga"],kind:"work",question:"credits",role:"AUTHORSHIP",priority:60,introducedAt:"2026-10-18",recommended:false,execution:{type:"template",path:{id:"other-works",revision:1},exampleId:prototypeSeeds[0].id,exampleName:["PLUTO","PLUTO"]}},
];
export const catalogFiltersSchema=z.object({q:z.string().max(100),worlds:z.array(z.enum(WORLD_IDS)).max(11),kind:z.enum(["person","work","organization","event"]).nullable(),question:z.enum(["credits","affiliations","influences"]).nullable(),role:roleIdSchema.nullable(),sort:z.enum(["recommended","newest","popular"])});
export type CatalogFilters=z.infer<typeof catalogFiltersSchema>;
export const initialCatalogFilters:CatalogFilters={q:"",worlds:[],kind:null,question:null,role:null,sort:"recommended"};
export const catalogWorkspaceSchema=z.object({filters:catalogFiltersSchema,mode:z.enum(["presets","names","explore"]),scroll:z.number().min(0).max(100000),pending:z.string().nullable(),active:z.string().nullable(),reader:z.enum(["records","paths"])});
export type CatalogWorkspace=z.infer<typeof catalogWorkspaceSchema>;
export const initialCatalogWorkspace:CatalogWorkspace={filters:initialCatalogFilters,mode:"presets",scroll:0,pending:null,active:null,reader:"records"};
// Future aggregate input: comparable observation window and complete coverage are required.
// No counters or analytics requests are collected by this UI prototype.
export type PresetPopularity={metric:"preset-starts";windowStart:string;windowEnd:string;asOf:string;counts:Readonly<Record<string,number>>};
export function findCatalogPresets(filters:CatalogFilters,popularity:PresetPopularity|null=null) {
  const normalize=(s:string)=>s.normalize("NFKC").toLowerCase();
  const words=normalize(filters.q.trim()).split(/\s+/).filter(Boolean);
  const items=presetCatalog.filter(p=>(!filters.worlds.length||filters.worlds.some(w=>p.worlds.includes(w)))&&(!filters.kind||p.kind===filters.kind)&&(!filters.question||p.question===filters.question)&&(!filters.role||p.role===filters.role)&&words.every(w=>normalize([...p.title,...p.description].join(" ")).includes(w)));
  const measured=!!popularity&&presetCatalog.every(p=>Number.isFinite(popularity.counts[p.id])&&popularity.counts[p.id]>=0);
  items.sort((a,b)=>(filters.sort==="newest"?b.introducedAt.localeCompare(a.introducedAt):filters.sort==="popular"&&measured?popularity!.counts[b.id]-popularity!.counts[a.id]:0)||b.priority-a.priority||a.id.localeCompare(b.id));
  return {items,popularityMeasured:measured};
}
export function hasCatalogFilters(f:CatalogFilters){return !!(f.q.trim()||f.worlds.length||f.kind||f.question||f.role||f.sort!=="recommended");}
