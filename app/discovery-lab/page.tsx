import { notFound } from "next/navigation";
import DiscoveryPrototype from "../../components/DiscoveryPrototype";
import { datasetMode } from "../../lib/domain/dataset";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discovery Lab — Plunode", robots: { index: false, follow: false } };
export default function DiscoveryLabPage() {
  if (datasetMode(process.env.GRAPH_DATASET) !== "public-kg") notFound();
  return <DiscoveryPrototype />;
}
