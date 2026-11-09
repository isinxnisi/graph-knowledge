import type { PoolClient } from "pg";
import { knowledgeOriginalText, translationTargetKey, type KnowledgeTextTarget, type KnowledgeDisplayTranslation } from "../domain/knowledge-translation";
import { readKnowledgeTextOriginal, readKnowledgeTranslationById, KnowledgeError } from "./knowledge-foundation";
import { translationId } from "./knowledge-translation-storage";

/** Read only. Reuse unchanged Theme prose, never relabel or publish an old
 * translation as a new edition. Hidden exact translations block older fallback. */
export async function publicDisplayTranslations(c: PoolClient, targets: KnowledgeTextTarget[], language: string): Promise<KnowledgeDisplayTranslation[]> {
  const unique = [...new Map(targets.map(t => [translationTargetKey(t), t])).values()];
  if (!unique.length) return [];
  const exactIds = unique.map(t => translationId(t, language));
  const themeIds = [...new Set(unique.filter(t => t.kind === "theme").map(t => t.id))];
  const heads = (await c.query(`SELECT id,target,visibility FROM knowledge75.text_translation_heads
    WHERE language=$1 AND (id=ANY($2::text[]) OR (target->>'kind'='theme' AND target->>'id'=ANY($3::text[])))`, [language, exactIds, themeIds])).rows;
  const result: KnowledgeDisplayTranslation[] = [];
  for (const target of unique) {
    const exact = heads.find(h => h.id === translationId(target, language));
    if (exact) {
      if (exact.visibility === "public") {
        try { result.push(await readKnowledgeTranslationById(c, exact.id)); }
        catch (e) { if (!(e instanceof KnowledgeError) || e.status >= 500) throw e; }
      }
      continue;
    }
    if (target.kind !== "theme") continue;
    const slot = (t: KnowledgeTextTarget) => translationTargetKey({ ...t, revision: 1 });
    const candidates = heads.filter(h => slot(h.target) === slot(target) && h.target.revision < target.revision)
      .sort((a,b) => b.target.revision - a.target.revision);
    // A withdrawn newer translation must not resurrect an older one.
    const candidate = candidates[0];
    if (!candidate || candidate.visibility !== "public") continue;
    try {
      const current = await readKnowledgeTextOriginal(c, target);
      const translation = await readKnowledgeTranslationById(c, candidate.id);
      if (translation.originalText !== current.text) continue;
      const editions = (await c.query(`SELECT content FROM knowledge75.revisions WHERE kind='theme' AND id=$1 AND revision>=$2 AND revision<=$3 ORDER BY revision`, [target.id, translation.target.revision, target.revision])).rows;
      // Do not reuse across an edit/revert, a removed axis, or changed language.
      if (editions.length !== target.revision - translation.target.revision + 1 || editions.some(v => {
        try { const value = knowledgeOriginalText(target, v.content); return value.text !== current.text || JSON.stringify(value.language) !== JSON.stringify(current.language); }
        catch { return true; }
      })) continue;
      result.push({ ...translation, displayTarget: target });
    } catch (e) { if (!(e instanceof KnowledgeError) || e.status >= 500) throw e; }
  }
  return result;
}

/** Only call after resolving this whole public snapshot in the SAME read transaction.
 * The batch cannot grant access to arbitrary request targets. Hidden translation heads are excluded.
 */
export async function publicThemeSnapshotTranslations(c:PoolClient,resolved:import("../domain/knowledge-foundation").KnowledgeThemeResolved,language:string):Promise<KnowledgeDisplayTranslation[]>{
 const {snapshot,theme}=resolved;
 const content=new Map<string,unknown>(),targets:KnowledgeTextTarget[]=[];
 const add=(kind:KnowledgeTextTarget["kind"],v:{id:string;revision:number;content:unknown},fields:KnowledgeTextTarget["field"][])=>{content.set(JSON.stringify([kind,v.id,v.revision]),v.content);for(const field of fields)try{knowledgeOriginalText({kind,id:v.id,revision:v.revision,field},v.content);targets.push({kind,id:v.id,revision:v.revision,field});}catch{}};
 for(const e of snapshot.entities)add("entity",e,["name","description"]);
 for(const s of snapshot.sources)add("source",s,["title","bibliography"]);
 const {recordTimeTextTargets,themeTimelineTextTargets}=await import("../domain/knowledge-timeline-text");
 for(const r of snapshot.records){add("record",r,["assertion","relation","scope"]);targets.push(...recordTimeTextTargets(r));for(const e of r.content.evidence)for(const field of ["excerpt","locator"] as const)if(e[field])targets.push({kind:"record",id:r.id,revision:r.revision,field,evidenceId:e.id});}
 const ids=targets.map(t=>translationId(t,language));
 const rows=(await c.query(`SELECT h.target,h.language,r.* FROM knowledge75.text_translation_heads h JOIN knowledge75.text_translation_revisions r ON r.id=h.id AND r.revision=h.current_revision WHERE h.id=ANY($1::text[]) AND h.language=$2 AND h.visibility='public'`,[ids,language])).rows;
 const exact:KnowledgeDisplayTranslation[]=rows.flatMap(r=>{const body=content.get(JSON.stringify([r.target.kind,r.target.id,r.target.revision]));try{if(knowledgeOriginalText(r.target,body).text!==r.original_text)return [];return [{id:r.id,revision:Number(r.revision),target:r.target,language:r.language,text:r.text,originalText:r.original_text,originalHash:r.original_hash,reason:r.reason,createdAt:r.created_at.toISOString()}];}catch{return [];}});
 const themeTargets:KnowledgeTextTarget[]=[{kind:"theme",id:theme.id,revision:theme.revision,field:"title"},...(theme.content.description?[{kind:"theme" as const,id:theme.id,revision:theme.revision,field:"description" as const}]:[]),...themeTimelineTextTargets(theme)];
 return [...exact,...await publicDisplayTranslations(c,themeTargets,language)];
}
