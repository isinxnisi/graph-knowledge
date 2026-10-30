// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen,fireEvent,waitFor} from "@testing-library/react";
import CapsuleNeighborPicker from "../components/CapsuleNeighborPicker";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import {captureCapsule} from "../lib/client/capsule-editor";
import {emptyGraph} from "../lib/client/graph-state";
import type {NeighborsResponse} from "../lib/domain/api";
const mocks=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock("../lib/client/api",()=>({fetchNeighbors:mocks.fetch}));
vi.mock("../lib/client/ui-locale",()=>({useUiLocale:()=>({locale:"ja"})}));
beforeEach(()=>{mocks.fetch.mockReset();HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});
afterEach(cleanup);
const base=examples.neighbors as NeighborsResponse;
function setup(){
 const first=base.claims[0],center=base.nodes.find(n=>n.id===first.subjectId)!,other=base.nodes.find(n=>n.id===first.objectId)!;
 const a={...other,id:"10000000-0000-4000-8000-000000000011",name:"アルファ",kind:"person" as const},b={...other,id:"10000000-0000-4000-8000-000000000012",name:"ベータ",kind:"work" as const};
 const claims=[{...first,id:"20000000-0000-4000-8000-000000000011",subjectId:center.id,objectId:a.id},{...first,id:"20000000-0000-4000-8000-000000000012",subjectId:center.id,objectId:b.id}];
 const doc=captureCapsule({...emptyGraph(),nodes:{[center.id]:center}}, {positions:{},pan:{x:0,y:0},zoom:1,initialLayoutDone:true},"demo","候補検証").document!;
 return {center,a,b,claims,doc,page:{...base,centerId:center.id,nodes:[center,a,b],claims,page:{hasMore:false,nextCursor:null}}};
}
it("分類・名前を横断した選択を保持し、非表示の選択も示して一括追加する",async()=>{
 const {doc,page,claims}=setup(),add=vi.fn();mocks.fetch.mockResolvedValue(page);
 render(<CapsuleNeighborPicker node={doc.nodes[0]} document={doc} onAdd={add} onClose={vi.fn()}/>);
 const alpha=await screen.findByRole("checkbox",{name:/アルファ/});fireEvent.click(alpha);
 fireEvent.change(screen.getByLabelText("名前で絞り込み"),{target:{value:"ベータ"}});
 expect(screen.queryByRole("checkbox",{name:/アルファ/})).toBeNull();expect(screen.getByText(/うち1件は現在の条件の外/)).toBeTruthy();
 fireEvent.click(screen.getByRole("checkbox",{name:/ベータ/}));fireEvent.change(screen.getByLabelText("分類"),{target:{value:"person"}});
 expect(screen.getByRole("button",{name:"2件をまとめて追加"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"条件を解除"}));
 expect((screen.getByRole("checkbox",{name:/アルファ/}) as HTMLInputElement).checked).toBe(true);
 fireEvent.click(screen.getByRole("button",{name:"2件をまとめて追加"}));expect(add.mock.calls[0][1]).toEqual(claims.map(c=>c.id));
});
it("ページの続きが失敗しても選択を保持し、部分取得を全件検索と扱わない",async()=>{
 const {doc,page,claims}=setup(),add=vi.fn();
 mocks.fetch.mockResolvedValueOnce({...page,nodes:page.nodes.slice(0,2),claims:[claims[0]],page:{hasMore:true,nextCursor:"page2"}}).mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce({...page,claims:[claims[1]]});
 render(<CapsuleNeighborPicker node={doc.nodes[0]} document={doc} onAdd={add} onClose={vi.fn()}/>);
 await screen.findByRole("alert");fireEvent.click(screen.getByRole("checkbox",{name:/アルファ/}));expect(screen.getByText(/読み込み済みの1件から絞り込み/)).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"続きを読み込む"}));await screen.findByRole("checkbox",{name:/ベータ/});
 expect((screen.getByRole("checkbox",{name:/アルファ/}) as HTMLInputElement).checked).toBe(true);
 await waitFor(()=>expect(screen.queryByRole("alert")).toBeNull());expect(mocks.fetch.mock.calls[2][1]).toBe("page2");
});

it("条件欄を閉じても条件と選択を保持し、開いた直後に検索へフォーカスを奪わない",async()=>{
 const {doc,page}=setup();mocks.fetch.mockResolvedValue(page);
 render(<CapsuleNeighborPicker node={doc.nodes[0]} document={doc} onAdd={vi.fn()} onClose={vi.fn()}/>);
 await screen.findByRole("checkbox",{name:/アルファ/});
 expect(document.activeElement).toBe(screen.getByRole("button",{name:"関係先を閉じる"}));
 expect(screen.queryByRole("combobox",{name:"分類"})).toBeNull();
 fireEvent.click(screen.getByRole("checkbox",{name:/アルファ/}));
 fireEvent.click(screen.getByRole("button",{name:"条件"}));
 fireEvent.change(screen.getByRole("combobox",{name:"分類"}),{target:{value:"work"}});
 fireEvent.click(screen.getByRole("button",{name:/^条件[12]?$/}));
 expect(screen.queryByRole("combobox",{name:"分類"})).toBeNull();
 expect(screen.getByText(/うち1件は現在の条件の外/)).toBeTruthy();
 expect(screen.queryByRole("checkbox",{name:/アルファ/})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"条件を解除"}));
 expect((screen.getByRole("checkbox",{name:/アルファ/}) as HTMLInputElement).checked).toBe(true);
});
