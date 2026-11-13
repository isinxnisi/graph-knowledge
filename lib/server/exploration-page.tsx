import {knowledgeCapability} from "./knowledge-deployment";
import "server-only";
import Explorer from "../../components/Explorer";
import PublicDiscovery from "../../components/PublicDiscovery";
import { datasetMode } from "../domain/dataset";
import { localizedPublicHref, type PublicLocale } from "../domain/public-routes";
import { discoveryLabels } from "../i18n/public-discovery";
import { explorationMetadata, publicationPolicy } from "./publication";
import { publicSubject } from "./public-discovery";
import { publicKnowledgeEntity } from "./knowledge-entity-page";
import { notFound } from "next/navigation";
import { discoveryHomeData } from "./discovery-home";
import { initialKnowledgeThemeHome } from "./knowledge-theme-home";
export async function discoveryMetadata(locale: PublicLocale, stateful: boolean, id?: string) {
  const text = discoveryLabels(locale), subject = id ? await publicSubject(id) : null;
  const common=id&&!subject?await publicKnowledgeEntity(id):null;
  const path = localizedPublicHref(id ? `/explore/${encodeURIComponent(id)}` : "/", locale);
  if(common)return explorationMetadata(path,stateful,text.entityTitle(common.content.name),common.content.description||text.description,true,{locale,paired:true});
  return explorationMetadata(path, stateful, subject ? text.entityTitle(subject.entity.name) : text.title,
    subject ? text.entityDescription(subject.entity.name, text.kinds[subject.entity.kind]) : text.description, !id || !!subject?.neighbors.claims.length,
    { locale, paired: true, ...(subject ? { image: `${path}/opengraph-image` } : {}) });
}
export async function ExplorationPage({ locale, id,initialKnowledgeTheme }: { locale: PublicLocale; id?: string;initialKnowledgeTheme?:import("../domain/knowledge-theme-reader").KnowledgeThemeRead }) {
  const knowledgeOperatorEnabled=process.env.THEME_WORKBENCH_ENABLED === "1";
  const knowledgeEnabled=(()=>{try{return (knowledgeOperatorEnabled||knowledgeCapability("public-read")) && process.env.KNOWLEDGE_WORKSPACE_ENABLED === "1";}catch{return false;}})();
  const dataset = datasetMode(process.env.GRAPH_DATASET), subject = dataset === "public-kg" && id ? await publicSubject(id) : undefined;
  const common=dataset==="public-kg"&&knowledgeEnabled&&id&&!subject?await publicKnowledgeEntity(id):null;
  if (dataset === "public-kg" && id && !subject&&!common) notFound();
  const overview = subject ? <PublicDiscovery locale={locale} subject={subject} /> : undefined;
  const isHome = dataset === "public-kg" && !id&&!initialKnowledgeTheme;
  const [home, initialThemes, services] = await Promise.all([
    isHome ? discoveryHomeData() : undefined,
    dataset === "public-kg" && knowledgeEnabled ? initialKnowledgeThemeHome() : undefined,
    publicationPolicy(),
  ]);
  return <Explorer key={common?.id??"legacy"} initialKnowledgeEntityId={common?.id} initialKnowledgeTheme={initialKnowledgeTheme} knowledgeOperatorEnabled={knowledgeOperatorEnabled} knowledgeEnabled={knowledgeEnabled} dataset={dataset} initialRoot={common?undefined:id} services={services} publicOverview={overview} discoveryHome={home} initialThemes={initialThemes} />;
}
