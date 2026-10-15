import { publicationPolicy } from "../../lib/server/publication";
import PrivacyPage from "../../components/PrivacyPage";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const published = (await publicationPolicy()).public;
  return { title: "プライバシー・外部送信について | Plunode", alternates: { canonical: "https://plunode.net/privacy" }, robots: { index: published, follow: published } };
}
export default async function Page() { return <PrivacyPage policy={await publicationPolicy()} />; }
