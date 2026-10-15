import { explorationMetadata, publicationPolicy } from "../../lib/server/publication";
import PrivacyPage from "../../components/PrivacyPage";
export const dynamic = "force-dynamic";
export async function generateMetadata() { return explorationMetadata("/privacy", false, "プライバシー・外部送信について — Plunode", "Plunodeの会員情報、任意の利用状況計測、広告設定、外部支援リンクの取り扱いについて。", true, { locale: "ja", paired: true }); }
export default async function Page() { return <PrivacyPage policy={await publicationPolicy()} />; }
