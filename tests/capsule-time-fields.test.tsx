// @vitest-environment jsdom
import {useState} from "react";
import {afterEach,expect,it} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import CapsuleTimeFields from "../components/CapsuleTimeFields";
import type {KnowledgeRecordContent} from "../lib/domain/knowledge-foundation";
afterEach(cleanup);
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
