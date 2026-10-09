import SharedCapsule from "../../components/SharedCapsule";
import { datasetMode } from "../../lib/domain/dataset";
export const dynamic = "force-dynamic";
export const metadata = { title: "共有されたCapsule", robots: { index: false, follow: false, noarchive: true }, referrer: "no-referrer" };
export default function Page() { return <SharedCapsule dataset={datasetMode(process.env.GRAPH_DATASET)} />; }
