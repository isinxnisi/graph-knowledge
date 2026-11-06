import {knowledgeCapability} from "./knowledge-deployment";
import "server-only";
import Explorer from "../../components/Explorer";
import PublicDiscovery from "../../components/PublicDiscovery";
import { datasetMode } from "../domain/dataset";
import { localizedPublicHref, type PublicLocale } from "../domain/public-routes";
import { discoveryLabels } from "../i18n/public-discovery";
import { explorationMetadata, publicationPolicy } from "./publication";
import { publicSubject } from "./public-discovery";
import { notFound } from "next/navigation";
import { discoveryHomeData } from "./discovery-home";
import { initialKnowledgeThemeHome } from "./knowledge-theme-home";
export async function discoveryMetadata(locale: PublicLocale, stateful: boolean, id?: string) {
  const text = discoveryLabels(locale), subject = id ? await publicSubject(id) : null;
  const path = localizedPublicHref(id ? `/explore/${id}` : "/", locale);
  return explorationMetadata(path, stateful, subject ? text.entityTitle(subject.entity.name) : text.title,
    subject ? text.entityDescription(subject.entity.name, text.kinds[subject.entity.kind]) : text.description, !id || !!subject?.neighbors.claims.length,
    { locale, paired: true, ...(subject ? { image: `${path}/opengraph-image` } : {}) });
}
export async function ExplorationPage({ locale, id }: { locale: PublicLocale; id?: string }) {
  const knowledgeOperatorEnabled=process.env.THEME_WORKBENCH_ENABLED === "1";
  const knowledgeEnabled=(()=>{try{return (knowledgeOperatorEnabled||knowledgeCapability("public-read")) && process.env.KNOWLEDGE_WORKSPACE_ENABLED === "1";}catch{return false;}})();
  const dataset = datasetMode(process.env.GRAPH_DATASET), subject = dataset === "public-kg" && id ? await publicSubject(id) : undefined;
  if (dataset === "public-kg" && id && !subject) notFound();
  const overview = subject ? <PublicDiscovery locale={locale} subject={subject} /> : undefined;
  const isHome = dataset === "public-kg" && !id;
  const [home, initialThemes, services] = await Promise.all([
    isHome ? discoveryHomeData() : undefined,
    isHome && knowledgeEnabled ? initialKnowledgeThemeHome() : undefined,
    publicationPolicy(),
  ]);
  return <Explorer knowledgeOperatorEnabled={knowledgeOperatorEnabled} knowledgeEnabled={knowledgeEnabled} dataset={dataset} initialRoot={id} services={services} publicOverview={overview} discoveryHome={home} initialThemes={initialThemes} />;
}
