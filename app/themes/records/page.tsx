import { themePageGuard } from "../../../lib/server/theme-page-guard";
import KnowledgeFoundation from "../../../components/KnowledgeFoundation";

export const dynamic = "force-dynamic";
export default function Page() {
  themePageGuard();
  return <KnowledgeFoundation />;
}
