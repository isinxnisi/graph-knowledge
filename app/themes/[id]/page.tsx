import { themePageGuard } from "../../../lib/server/theme-page-guard";
import ThemeWorkbench from "../../../components/ThemeWorkbench";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  themePageGuard();
  return <ThemeWorkbench themeId={id} />;
}
