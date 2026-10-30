import type { Metadata } from "next";
import SharedCapsule from "../../../components/SharedCapsule";
import { datasetMode } from "../../../lib/domain/dataset";
import { capsuleSharePath } from "../../../lib/domain/capsule-sharing";
import { capsulePreview } from "../../../lib/server/capsule-preview";
import { memberRuntime } from "../../../lib/server/member/runtime";
export const dynamic="force-dynamic";
type Props={params:Promise<{token:string}>;searchParams:Promise<{revision?:string|string[]}>};
const robots={index:false,follow:false,noarchive:true};
export async function generateMetadata({params,searchParams}:Props):Promise<Metadata> {
  const {token}=await params,{revision}=await searchParams;
  const shared=await capsulePreview(token,typeof revision==="string"?revision:revision?"invalid":undefined);
  if(!shared)return {title:"共有リンクを確認してください · Plunode",description:"この共有リンクでは閲覧できません。",robots,referrer:"no-referrer",openGraph:{title:"Plunode",description:"この共有リンクでは閲覧できません。",images:[]},twitter:{card:"summary",images:[]}};
  const {capsule}=shared,origin=memberRuntime().config.origin;
  const description=capsule.content.note.trim().slice(0,180)||`${capsule.content.document?.nodes.length??capsule.content.entityIds.length}の対象と、そのつながりをまとめたCapsule。`;
  const url=new URL(capsuleSharePath(token,revision?capsule.revision:undefined),origin).href;
  const image=new URL(`/shared/${token}/image/${capsule.revision}`,origin).href;
  return {metadataBase:new URL(origin),title:`${capsule.content.title} · Plunode`,description,robots,referrer:"no-referrer",openGraph:{type:"website",title:capsule.content.title,description,url,siteName:"Plunode",images:[{url:image,width:1200,height:630,alt:`${capsule.content.title}の関係図`}]},twitter:{card:"summary_large_image",title:capsule.content.title,description,images:[image]}};
}
export default async function Page({params,searchParams}:Props){
  const {token}=await params,{revision}=await searchParams;
  const shared=await capsulePreview(token,typeof revision==="string"?revision:revision?"invalid":undefined);
  return <SharedCapsule key={`${token}:${revision??"latest"}`} dataset={datasetMode(process.env.GRAPH_DATASET)} linkToken={shared?token:"invalid"} initialRevision={shared&&revision?shared.capsule.revision:undefined}/>;
}
