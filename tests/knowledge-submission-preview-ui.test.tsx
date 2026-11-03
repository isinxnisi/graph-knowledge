// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import KnowledgeSubmissionGraph from "../components/KnowledgeSubmissionGraph";
import type {KnowledgeSubmissionContent} from "../lib/domain/knowledge-submission";
vi.mock("../components/GraphCanvas",()=>({default:()=> <div data-testid="proposal-canvas"/>}));
afterEach(cleanup);
const content:KnowledgeSubmissionContent={title:"草稿",entities:[],entityPins:[],sources:[],sourcePins:[],items:[{key:"item",operation:"create-entity",record:{kind:"note",subjectId:"new",objectId:null,assertion:"",relation:"",polarity:"affirmed",scope:"",times:[],evidence:[]}}]};
it("keeps a fresh manual form compact while names are typed and expands only when requested",async()=>{
 const view=render(<KnowledgeSubmissionGraph content={content}/>),details=screen.getByLabelText("投稿する内容と既存の知識") as HTMLDetailsElement;
 expect(details.open).toBe(false);
 view.rerender(<KnowledgeSubmissionGraph content={{...content,entities:[{id:"new",content:{name:"一文字",aliases:[],kind:"person",description:"",language:"ja"}}]}}/>);
 expect(details.open).toBe(false);expect(screen.queryByTestId("proposal-canvas")).toBeNull();
 fireEvent.click(screen.getByText("投稿する箇所"));await waitFor(()=>expect(details.open).toBe(true));expect(screen.getByTestId("proposal-canvas")).toBeTruthy();
});
it("opens captured context initially and retains the user disclosure choice on form changes",async()=>{
 const context={entities:[{id:"old",content:{name:"既存",aliases:[],kind:"person",description:"",language:"ja"}}],sources:[]};
 const view=render(<KnowledgeSubmissionGraph content={content} context={context}/>),details=screen.getByLabelText("投稿する内容と既存の知識") as HTMLDetailsElement;
 expect(details.open).toBe(true);fireEvent.click(screen.getByText("投稿する箇所"));await waitFor(()=>expect(details.open).toBe(false));
 view.rerender(<KnowledgeSubmissionGraph content={{...content,title:"改訂"}} context={context}/>);expect(details.open).toBe(false);
});
