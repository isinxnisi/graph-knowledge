import SupportPage from "../../components/SupportPage";
import { explorationMetadata } from "../../lib/server/publication";
export const dynamic = "force-dynamic";
export async function generateMetadata() { return explorationMetadata("/support", false, "Plunodeを支援する | Support Plunode", "Plunodeのサーバー運営、知識データの拡充、探索・共有機能の開発を支える任意の支援について。Support the development of Plunode."); }
export default function Page() { return <SupportPage />; }
