import "server-only";
import { notFound } from "next/navigation";
import AiLab from "../../components/AiLab";
import { aiLabEnabled, loadAiLabArtifact } from "./ai-lab";
export async function AiLabPage() {
  if (!aiLabEnabled()) notFound();
  const artifact = await loadAiLabArtifact().catch(() => null);
  return <AiLab artifact={artifact}/>;
}
