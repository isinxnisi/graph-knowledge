import { explorationMetadata, publicationPolicy } from "../../../lib/server/publication";
import PrivacyPage from "../../../components/PrivacyPage";
export const dynamic = "force-dynamic";
export async function generateMetadata() { return explorationMetadata("/en/privacy", false, "Privacy and external services — Plunode", "How Plunode handles account data, optional analytics, advertising preferences and external support links.", true, { locale: "en", paired: true }); }
export default async function Page() { return <PrivacyPage policy={await publicationPolicy()} />; }
