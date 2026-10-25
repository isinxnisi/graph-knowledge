import {notFound} from 'next/navigation';
import FollowingPage from '../../../components/FollowingPage';
import {publicProfilesEnabled} from '../../../lib/server/member/public-profiles';
export const dynamic='force-dynamic';
export const metadata={title:'フォロー中 | Plunode',robots:{index:false,follow:false}};
export default function Page(){if(!publicProfilesEnabled())notFound();return <FollowingPage/>;}
