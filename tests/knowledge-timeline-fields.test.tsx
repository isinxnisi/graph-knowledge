// @vitest-environment jsdom
import {afterEach,it,expect,vi} from "vitest";
import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import KnowledgeTimelineFields from "../components/KnowledgeTimelineFields";
import {knowledgeRecordContentSchema,type KnowledgeTimeline} from "../lib/domain/knowledge-foundation";
afterEach(cleanup);
it("selects an exact parent time and applies a layout without editing the original record",async()=>{
 const record={id:"parent",revision:1,createdAt:"",reason:"",content:knowledgeRecordContentSchema.parse({kind:"note",assertion:"親の出来事",times:[{id:"first",time:{kind:"calendar",from:"1991",label:""}},{id:"second",time:{kind:"calendar",from:"1992",label:""}}],evidence:[{id:"e",source:{id:"source",revision:1},locator:"本文"}]})};
 const save=vi.fn((layout:KnowledgeTimeline)=>!!layout);render(<KnowledgeTimelineFields expanded records={[record]} onSave={save}/>);fireEvent.click(screen.getByRole("button",{name:"軸を追加"}));fireEvent.change(screen.getByLabelText("軸の名前"),{target:{value:"詳しい時期"}});fireEvent.change(screen.getByLabelText("子軸の接続先"),{target:{value:JSON.stringify(["parent","second"])}});fireEvent.click(screen.getByRole("button",{name:"構成を適用"}));expect(save).toHaveBeenCalledOnce();expect(save.mock.calls[0][0]).toMatchObject({insets:[{parentRecordId:"parent",parentTimeId:"second",label:"詳しい時期"}]});expect(record.content.times[0].time).toMatchObject({from:"1991"});
});
it("shows a useful validation message rather than applying an unnamed axis",()=>{const save=vi.fn(()=>true);render(<KnowledgeTimelineFields expanded records={[]} onSave={save}/>);fireEvent.click(screen.getByRole("button",{name:"軸を追加"}));fireEvent.click(screen.getByRole("button",{name:"構成を適用"}));expect(screen.getByRole("alert").textContent).toContain("軸の名前");expect(save).not.toHaveBeenCalled();});
