import {knowledgeSubmissionsAvailable} from "../../../../lib/server/knowledge-deployment";
import {notFound} from "next/navigation";
import KnowledgeSubmissions from "../../../../components/KnowledgeSubmissions";
export const dynamic="force-dynamic";
export const metadata={title:"知識の投稿 | Plunode",robots:{index:false,follow:false}};
export default function Page(){if(!knowledgeSubmissionsAvailable())notFound();return <KnowledgeSubmissions/>;}
