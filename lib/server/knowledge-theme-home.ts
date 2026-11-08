import "server-only";
import { headers } from "next/headers";
import configured from "../../data/theme-discovery.json";
import { memberConfig } from "./member/config";
import { memberRuntime } from "./member/runtime";
import { readFeaturedThemes } from "./member/featured-themes";
import type { KnowledgeThemeHome, KnowledgeThemePage } from "../domain/knowledge-theme-reader";
import { knowledgePublicationPreview } from "./knowledge-publication-preview";
import { knowledgeReadGuard } from "./knowledge-read-runtime";

async function featuredIds(): Promise<string[]> {
  try {
    if (!memberConfig()) return configured.featuredThemeIds;
    return (await readFeaturedThemes(memberRuntime().pool)).themeIds;
  }
  catch (error) {
    // Do not replace an operator's selection with old defaults on a transient DB outage.
    console.error("Featured theme settings unavailable");
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return configured.featuredThemeIds;
    return [];
  }
}

type ThemeReader = { themes: () => Promise<KnowledgeThemePage> };
/** The HTML and the refresh endpoint use the same authorised catalogue. No process cache. */
export async function knowledgeThemeHome(service?: ThemeReader): Promise<KnowledgeThemeHome> {
  const reader = service ?? await knowledgePublicationPreview();
  const [page, ids] = await Promise.all([reader.themes(), featuredIds()]);
  const byId = new Map(page.themes.map(theme => [theme.id, theme]));
  return {
    featured: ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []),
    recent: page.themes.slice(0, 8), total: page.themes.length,
  };
}
/** A failed Theme read must not hold the ordinary TOP indefinitely or bypass the preview Host guard. */
export async function initialKnowledgeThemeHome(): Promise<KnowledgeThemeHome | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const requestHeaders = await headers();
    knowledgeReadGuard(new Request("http://localhost:3276/", { headers: { host: requestHeaders.get("host") ?? "" } }));
    return await Promise.race([
      knowledgeThemeHome(),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 8000); }),
    ]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}
