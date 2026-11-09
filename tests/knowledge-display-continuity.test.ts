import { beforeEach, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { publicDisplayTranslations } from "../lib/server/knowledge-display-translations";
import { readKnowledgeTextOriginal, readKnowledgeTranslationById, KnowledgeError } from "../lib/server/knowledge-foundation";
import { knowledgeDisplayText } from "../lib/domain/knowledge-display";
import { translationId, translationHash } from "../lib/server/knowledge-translation-storage";
import type { KnowledgeTextTarget } from "../lib/domain/knowledge-translation";
vi.mock("../lib/server/knowledge-foundation",async original=>({...await original<typeof import("../lib/server/knowledge-foundation")>(),readKnowledgeTextOriginal:vi.fn(),readKnowledgeTranslationById:vi.fn()}));
const target:KnowledgeTextTarget={kind:"theme",id:"theme",revision:8,field:"title"};
const old={...target,revision:6},language={tag:"ja",basis:"declared"} as const;
const content={title:"Webbの歩み",textLanguages:{title:language}};
const translation={id:translationId(old,"en"),revision:1,target:old,language:"en",text:"Webb’s journey",originalText:content.title,originalHash:translationHash(content.title),reason:"Published",createdAt:"2026-11-09T00:00:00Z"};
let heads:{id:string;target:KnowledgeTextTarget;visibility:string}[],editions:unknown[];
const query=vi.fn(async (sql:string)=>({rows:sql.includes("text_translation_heads")?heads:editions.map(content=>({content}))}));
const c={query} as unknown as PoolClient;
beforeEach(()=>{
  vi.clearAllMocks();heads=[{id:translation.id,target:old,visibility:"public"}];editions=[content,content,content];
  vi.mocked(readKnowledgeTextOriginal).mockResolvedValue({target,text:content.title,hash:translation.originalHash,language,content} as never);
  vi.mocked(readKnowledgeTranslationById).mockResolvedValue(translation);
});
it("reuses unchanged text across composition editions without forging a translation edition",async()=>{
  const rows=await publicDisplayTranslations(c,[target],"en");
  expect(rows[0]).toMatchObject({id:translation.id,target:old,revision:1,displayTarget:target});
  expect(knowledgeDisplayText(rows,target,"en",content.title)).toBe(translation.text);
  expect(translation.target.revision).toBe(6);
  expect(query.mock.calls.every(([sql])=>/^SELECT/.test(sql.trim()))).toBe(true);
});
it.each(["changed","reverted","language","removed"])("does not reuse across %s original content",async kind=>{
  editions=kind==="changed"?[{...content,title:"別の意味"}]:kind==="reverted"?[content,{...content,title:"別の意味"},content]:kind==="language"?[{...content,textLanguages:{title:{tag:"en",basis:"declared"}}}]:[{}];
  expect(await publicDisplayTranslations(c,[target],"en")).toEqual([]);
});
it("does not resurrect hidden exact or newer translations",async()=>{
  heads.push({id:translationId(target,"en"),target,visibility:"hidden"});
  expect(await publicDisplayTranslations(c,[target],"en")).toEqual([]);
  heads=[heads[0],{id:"hidden-newer",target:{...target,revision:7},visibility:"hidden"}];
  expect(await publicDisplayTranslations(c,[target],"en")).toEqual([]);
});
it("requires both current and historical public read authorization",async()=>{
  vi.mocked(readKnowledgeTextOriginal).mockRejectedValueOnce(new KnowledgeError("Not public",404));
  expect(await publicDisplayTranslations(c,[target],"en")).toEqual([]);
  vi.mocked(readKnowledgeTranslationById).mockRejectedValueOnce(new KnowledgeError("Old source hidden",404));
  expect(await publicDisplayTranslations(c,[target],"en")).toEqual([]);
});
it("keeps exact editions authoritative and never inherits record translations",async()=>{
  heads.push({id:translationId(target,"en"),target,visibility:"public"});
  vi.mocked(readKnowledgeTranslationById).mockResolvedValueOnce({...translation,target});
  expect((await publicDisplayTranslations(c,[target],"en"))[0].displayTarget).toBeUndefined();
  const record={...target,kind:"record" as const,field:"assertion" as const};
  expect(await publicDisplayTranslations(c,[record],"en")).toEqual([]);
});
