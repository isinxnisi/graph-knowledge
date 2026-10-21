import {notFound} from 'next/navigation';
import CommunityPage from '../../components/CommunityPage';
import {datasetMode} from '../../lib/domain/dataset';
export const dynamic='force-dynamic';
export const metadata={title:'コミュニティ | Plunode',robots:{index:false,follow:false}};
export default function Page(){if(process.env.COMMUNITY_ENABLED!=='1')notFound();return <CommunityPage dataset={datasetMode(process.env.GRAPH_DATASET)}/>;}
