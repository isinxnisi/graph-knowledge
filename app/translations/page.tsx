import {Suspense} from "react";
import KnowledgeTranslationPage from "../../components/KnowledgeTranslationPage";
export const metadata={title:"翻訳 | Plunode",robots:{index:false,follow:false}};
export default function Page(){return <Suspense><KnowledgeTranslationPage/></Suspense>;}
