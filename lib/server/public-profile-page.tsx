import {notFound} from 'next/navigation';
import PublicProfileView from '../../components/PublicProfileView';
import {publicProfilesEnabled} from './member/public-profiles';
import {publicHandleSchema} from '../domain/public-profile';
import {datasetMode} from '../domain/dataset';
export async function PublicProfilePage({params}:{params:Promise<{handle:string}>}) {
  const {handle}=await params;
  if(!publicProfilesEnabled()||!publicHandleSchema.safeParse(handle).success)notFound();
  return <PublicProfileView key={handle} handle={handle} dataset={datasetMode(process.env.GRAPH_DATASET)}/>;
}
