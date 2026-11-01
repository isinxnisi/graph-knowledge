import KnowledgeFoundation from "../../../components/KnowledgeFoundation";
import { themeGuard } from "../../../lib/server/theme-workbench";

export const dynamic = "force-dynamic";
export default function Page() {
  themeGuard();
  return <KnowledgeFoundation />;
}
