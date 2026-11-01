import ThemeWorkbench from "../../../components/ThemeWorkbench";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ThemeWorkbench themeId={id} />;
}
