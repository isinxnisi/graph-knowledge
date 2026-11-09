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
