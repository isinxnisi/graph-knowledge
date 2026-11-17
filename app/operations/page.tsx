import {notFound} from 'next/navigation';
import {OperationsPage} from '../../components/OperationsPage';
import {datasetMode} from '../../lib/domain/dataset';
export const dynamic='force-dynamic';
export const metadata={title:'Site operations · Plunode',robots:{index:false,follow:false}};
export default function Page(){if(process.env.SITE_OPERATIONS_ENABLED!=='1')notFound();return <OperationsPage dataset={datasetMode(process.env.GRAPH_DATASET)}/>;}