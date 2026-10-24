import {notFound} from 'next/navigation';
import CommunityPage from '../../../components/CommunityPage';

export const dynamic='force-dynamic';
export const metadata={title:'コミュニティ | Plunode',referrer:'no-referrer',robots:{index:false,follow:false}};
export default function Page(){if(process.env.COMMUNITY_ENABLED!=='1')notFound();return <CommunityPage/>;}
