import {notFound} from 'next/navigation';
import {datasetMode} from '../../../lib/domain/dataset';
import CommunityPage from '../../../components/CommunityPage';

export const dynamic='force-dynamic';
export const metadata={title:'コミュニティ | Plunode',referrer:'no-referrer',robots:{index:false,follow:false}};
export default function Page(){if(process.env.COMMUNITY_ENABLED!=='1')notFound();return <CommunityPage dataset={datasetMode(process.env.GRAPH_DATASET)}/>;}
