import {expect,it,vi} from "vitest";
vi.mock("../lib/server/capsule-preview",()=>({capsulePreview:vi.fn(async()=>null)}));
vi.mock("../lib/server/member/runtime",()=>({memberRuntime:vi.fn()}));
vi.mock("../components/SharedCapsule",()=>({default:()=>null}));
import Page,{generateMetadata} from "../app/shared/[token]/page";
const token="a".repeat(43);
it.each([undefined,"2"])("読取停止時も要求した版%sを保ち、公開状態の再確認を可能にする",async revision=>{
 const props={params:Promise.resolve({token}),searchParams:Promise.resolve({revision})};
 const page=await Page(props);expect(page.props.linkToken).toBe(token);expect(page.props.initialRevision).toBe(revision?2:undefined);
 const metadata=await generateMetadata(props);expect(metadata.openGraph).toMatchObject({title:"Plunode",images:[]});
});
it.each(["0","bad","9007199254740992",["1","2"]])("不正な版指定%sを最新共有版へ読み替えない",async revision=>{
 const page=await Page({params:Promise.resolve({token}),searchParams:Promise.resolve({revision})});expect(page.props.linkToken).toBe("invalid");
});
