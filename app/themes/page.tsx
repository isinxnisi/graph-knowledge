import { themePageGuard } from "../../lib/server/theme-page-guard";
import ThemeWorkbench from "../../components/ThemeWorkbench";
export const dynamic = "force-dynamic";
export default async function Page() {
  themePageGuard();
  return <ThemeWorkbench />;
}
