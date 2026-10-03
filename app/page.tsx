import Explorer from "../components/Explorer";
import { datasetMode } from "../lib/domain/dataset";

export const dynamic = "force-dynamic";
export default function Page() { return <Explorer key={datasetMode(process.env.GRAPH_DATASET)} dataset={datasetMode(process.env.GRAPH_DATASET)} />; }
