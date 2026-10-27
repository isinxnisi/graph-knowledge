import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminAuthorized } from "../../lib/server/kg-admin-access";
import KgAdmin from "../../components/KgAdmin";
export const dynamic = "force-dynamic";
export const metadata = { title: "Plunode · KG管理", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page() {
  if (!await adminAuthorized(await headers())) notFound();
  return <KgAdmin locale="ja" />;
}
