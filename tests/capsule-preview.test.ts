import {it,expect,vi} from "vitest";
import {writeFile} from "node:fs/promises";
import type {MemberCapsule} from "../lib/domain/member-capsule";
vi.mock("server-only",()=>({}));
import {capsuleShareImage} from "../lib/server/capsule-share-image";
import {capsulePreviewModel} from "../lib/domain/capsule-preview";
const nodes=Array.from({length:9},(_,i)=>({key:String(i),title:["PLUTO","浦沢直樹","長崎尚志","手塚治虫","手塚眞","MASTERキートン","作品を読む視点","MONSTER","関連する作品"][i],description:"",badge:"",origin:{kind:"local" as const}}));
const capsule={id:"10000000-0000-4000-8000-000000000001",schemaVersion:2,revision:2,createdAt:"2026-10-30T00:00:00Z",updatedAt:"2026-10-30T00:00:00Z",content:{dataset:"demo",title:"PLUTO ― 作品と作者のつながり",note:"作品の背景をたどり、作者たちの関係と資料を一枚の図にまとめました。",language:"ja",entityIds:[],claimIds:[],document:{schemaVersion:1,nodes,relations:nodes.slice(1).map(n=>({key:"edge"+n.key,source:"0",target:n.key,label:"関係する",note:"",origin:{kind:"local"}})),texts:[],evidence:[],unresolvedClaimIds:[]}}} as MemberCapsule;
it("カードは実在する接続だけを選び、タイトルと対象の一部を1200×630に描画する",async()=>{
 const model=capsulePreviewModel(capsule);expect(model.nodes).toHaveLength(7);expect(model.nodes[0].key).toBe("0");expect(model.totalNodes).toBe(9);
 for(const edge of model.edges)expect(capsule.content.document!.relations).toContainEqual(edge);
 const response=await capsuleShareImage(capsule),bytes=Buffer.from(await response.arrayBuffer());
 expect(response.headers.get("cache-control")).toBe("private, no-store");expect(bytes.subarray(1,4).toString()).toBe("PNG");expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBe(630);
 if(process.env.CAPSULE_PREVIEW_PROOF)await writeFile(process.env.CAPSULE_PREVIEW_PROOF,bytes);
},30000);
