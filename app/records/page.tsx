import {Suspense} from 'react';
import KnowledgeRecordVersionPage from '../../components/KnowledgeRecordVersionPage';
export const metadata={title:'公開した知識 | Plunode',robots:{index:false,follow:false}};
export default function Page(){return <Suspense><KnowledgeRecordVersionPage/></Suspense>;}
