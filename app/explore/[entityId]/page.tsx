import { discoveryMetadata, ExplorationPage } from "../../../lib/server/exploration-page";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params, searchParams }: { params: Promise<{ entityId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) { return discoveryMetadata("ja", Object.keys(await searchParams).length > 0, (await params).entityId); }
export default async function Page({ params }: { params: Promise<{ entityId: string }> }) { return <ExplorationPage locale="ja" id={(await params).entityId} />; }
