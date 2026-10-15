import SupportPage from "../../components/SupportPage";
import { explorationMetadata } from "../../lib/server/publication";
export const dynamic = "force-dynamic";
export async function generateMetadata() { return explorationMetadata("/support", false, "Plunodeを支援する — 開発支援のご案内", "Plunodeのサーバー運営、知識データの拡充、探索・共有機能の開発を支える任意の支援について。", true, { locale: "ja", paired: true }); }
export default function Page() { return <SupportPage />; }
