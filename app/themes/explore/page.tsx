import { themePageGuard } from "../../../lib/server/theme-page-guard";
import KnowledgeExplorer from "../../../components/KnowledgeExplorer";
export const dynamic = "force-dynamic";
export default function Page() { themePageGuard(); return <KnowledgeExplorer />; }
