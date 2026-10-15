import SupportPage from "../../../components/SupportPage";
import { explorationMetadata } from "../../../lib/server/publication";
export const dynamic = "force-dynamic";
export async function generateMetadata() { return explorationMetadata("/en/support", false, "Support Plunode — Help a knowledge graph grow", "Optional contributions help Plunode operate its servers, expand source-backed knowledge and develop exploration and sharing. Support through Buy Me a Coffee.", true, { locale: "en", paired: true }); }
export default function Page() { return <SupportPage />; }
