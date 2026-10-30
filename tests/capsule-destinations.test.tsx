// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
const mocks=vi.hoisted(()=>({request:vi.fn(),user:{id:"10000000-0000-4000-8000-000000000001"}}));
vi.mock("../lib/client/member-api",()=>({memberRequest:mocks.request}));
vi.mock("../lib/client/use-member-identity",()=>({useMemberSession:()=>({user:mocks.user,status:"authenticated"})}));
vi.mock("../lib/client/ui-locale",()=>({useUiLocale:()=>({locale:"ja"})}));
import CapsuleDestinations from "../components/CapsuleDestinations";
const capsuleId="20000000-0000-4000-8000-000000000001",ownerId=mocks.user.id;
afterEach(()=>{cleanup();vi.clearAllMocks();mocks.user={id:ownerId};});
it('opens community destinations on demand and preserves each published version in a new-tab link',async()=>{
 mocks.request.mockResolvedValue({destinations:[{id:"30000000-0000-4000-8000-000000000001",communityId:"40000000-0000-4000-8000-000000000001",title:"読書会",audience:"cohort",visibility:"members",revision:4}],nextCursor:null});
 const view=render(<CapsuleDestinations capsuleId={capsuleId} ownerId={ownerId}/>);
 expect(mocks.request).not.toHaveBeenCalled();fireEvent.click(screen.getByText('掲載しているコミュニティ'));
 const link=await screen.findByRole('link',{name:/読書会/});expect(link.getAttribute('target')).toBe('_blank');expect(decodeURIComponent(link.getAttribute('href')!)).toContain('?tab=capsules&listing=30000000');expect(link.textContent).toContain('掲載時の参加者限定 · 保存版 4');
 expect(mocks.request.mock.calls[0][2].user).toBe(ownerId);
 mocks.user={id:"50000000-0000-4000-8000-000000000001"};view.rerender(<CapsuleDestinations capsuleId={capsuleId} ownerId={ownerId}/>);expect(screen.queryByText('読書会')).toBeNull();
});
it('a failed lookup offers retry without claiming that there are no destinations',async()=>{
 mocks.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({destinations:[],nextCursor:null});
 render(<CapsuleDestinations capsuleId={capsuleId} ownerId={ownerId}/>);fireEvent.click(screen.getByText('掲載しているコミュニティ'));
 await screen.findByRole('alert');expect(screen.queryByText('現在閲覧できる掲載先はありません。')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'再試行'}));await waitFor(()=>expect(screen.getByText('現在閲覧できる掲載先はありません。')).toBeTruthy());
});
