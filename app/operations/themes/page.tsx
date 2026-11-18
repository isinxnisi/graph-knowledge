import {headers} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {themeOperator} from '../../../lib/server/theme-operator-preview';
export const dynamic='force-dynamic';
export const metadata={title:'テーマ制作 | Plunode',robots:{index:false,follow:false}};
export default async function Page(){try{await themeOperator(await headers());}catch{notFound();}redirect('/operations#themes');}
