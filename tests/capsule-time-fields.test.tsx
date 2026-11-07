// @vitest-environment jsdom
import {useState} from "react";
import {afterEach,expect,it} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import CapsuleTimeFields from "../components/CapsuleTimeFields";
import type {KnowledgeRecordContent} from "../lib/domain/knowledge-foundation";
afterEach(cleanup);
it("edits cyclic and qualitative times without losing the other annotations",()=>{
 let last:KnowledgeRecordContent["times"]=[];
 function Fields(){const [v,set]=useState<KnowledgeRecordContent["times"]>([{id:"one",time:{kind:"calendar",from:"1991",meaning:"point",label:""}}]);last=v;return <CapsuleTimeFields value={v} onChange={set} locale="ja"/>;}
 render(<Fields/>);fireEvent.change(screen.getByLabelText("時間軸"),{target:{value:"cycle"}});fireEvent.change(screen.getByLabelText("軸の名前"),{target:{value:"一日"}});fireEvent.change(screen.getByLabelText("始めの位置"),{target:{value:"22"}});fireEvent.change(screen.getByLabelText("終わりの位置"),{target:{value:"2"}});fireEvent.click(screen.getByLabelText("一周の境目をまたぐ"));
 expect(last[0].time).toMatchObject({kind:"cycle",from:22,to:2,wrap:true});fireEvent.click(screen.getByRole("button",{name:"時期を追加"}));const second=within(screen.getByRole("group",{name:"時期2"}));fireEvent.change(second.getByLabelText("時間軸"),{target:{value:"qualitative"}});fireEvent.change(second.getByLabelText("段階・始め"),{target:{value:"制作中"}});expect(last[0].time.kind).toBe("cycle");expect(last[1].time).toMatchObject({kind:"qualitative",from:"制作中"});
});
it("keeps multiple dates in named groups and removes only the selected time",()=>{
 function Fields(){const [times,setTimes]=useState<KnowledgeRecordContent["times"]>([{id:"first",time:{kind:"calendar",meaning:"point",from:"2021-12-25",label:"打ち上げ"}},{id:"second",time:{kind:"calendar",meaning:"duration",from:"2021-12-28",to:"2022-01-04",label:"展開工程"}}]);return <CapsuleTimeFields value={times} onChange={setTimes} locale="ja" guidance/>;}
 render(<Fields/>);
 const first=within(screen.getByRole("group",{name:"時期1"})),second=within(screen.getByRole("group",{name:"時期2"}));
 expect(first.getByRole("textbox",{name:"時期1の始め"})).toHaveProperty("value","2021-12-25");
 expect(second.getByRole("textbox",{name:"時期2の終わり"})).toHaveProperty("value","2022-01-04");
 fireEvent.click(first.getByRole("button",{name:"時期1を外す"}));
 const remaining=within(screen.getByRole("group",{name:"時期1"}));
 expect(remaining.getByRole("textbox",{name:"時期1の始め"})).toHaveProperty("value","2021-12-28");
 expect(remaining.getByRole("textbox",{name:"時期1の終わり"})).toHaveProperty("value","2022-01-04");
 expect(screen.queryByRole("group",{name:"時期2"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"時期を追加"}));expect(screen.getByRole("group",{name:"時期2"})).toBeTruthy();
});
