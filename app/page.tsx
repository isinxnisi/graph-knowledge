import { discoveryMetadata, ExplorationPage } from "../lib/server/exploration-page";
export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return discoveryMetadata("ja", Object.keys(await searchParams).length > 0); }
export default function Page() { return <ExplorationPage locale="ja" />; }
