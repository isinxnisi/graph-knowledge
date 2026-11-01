import KnowledgeExplorer from "../../../components/KnowledgeExplorer";
import { themeGuard } from "../../../lib/server/theme-workbench";
export const dynamic = "force-dynamic";
export default function Page() { themeGuard(); return <KnowledgeExplorer />; }
