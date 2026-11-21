// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ThemeProductionOperations} from '../components/ThemeProductionOperations';
const mock=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../lib/client/member-api',()=>({memberRequest:mock.request}));
vi.mock('../lib/client/ui-locale',()=>({useUiLocale:()=>({locale:'en'})}));
const items=[
 {id:'theme:working',title:'Working theme',currentRevision:29,publishedRevision:28,state:'production',unfinished:['Long draft and source checks'],blockers:['Awaiting source response']},
 {id:'theme:review',title:'Review theme',currentRevision:22,publishedRevision:21,state:'review',unfinished:['Whole-theme review'],blockers:[]},
 {id:'theme:done',title:'Published theme',currentRevision:8,publishedRevision:8,state:'published',unfinished:[],blockers:[]},
];
beforeEach(()=>{mock.request.mockReset().mockResolvedValue({items});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('keeps working/public editions and complete work notes in a compact closed disclosure',async()=>{
 render(<ThemeProductionOperations userId="owner" authorized/>);
 await screen.findByRole('link',{name:'Working theme'});
 const row=screen.getByRole('link',{name:'Working theme'}).closest('li')!;
 expect(row.textContent).toContain('Working 29');expect(row.textContent).toContain('Published · revision 28');
 const details=row.querySelector('details')!;expect(details.open).toBe(false);
 fireEvent.click(within(row).getByText('Remaining 1 · Blocked 1'));
 expect(within(row).getByText('Long draft and source checks')).toBeDefined();expect(within(row).getByText('Awaiting source response')).toBeDefined();
 expect(screen.getByRole('link',{name:'Working theme'}).getAttribute('href')).toBe('/operations/themes/theme%3Aworking');
});
it('filters and refreshes through read-only requests without creating or editing a theme',async()=>{
 render(<ThemeProductionOperations userId="owner" authorized/>);await screen.findByRole('link',{name:'Working theme'});
 fireEvent.click(screen.getByRole('button',{name:/^In review/}));expect(screen.queryByRole('link',{name:'Working theme'})).toBeNull();expect(screen.getByRole('link',{name:'Review theme'})).toBeDefined();
 fireEvent.click(screen.getByRole('button',{name:/^All/}));fireEvent.change(screen.getByRole('searchbox'),{target:{value:'published'}});
 expect(screen.getByRole('link',{name:'Published theme'})).toBeDefined();expect(screen.queryByRole('link',{name:'Review theme'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await waitFor(()=>expect(mock.request).toHaveBeenCalledTimes(2));
 for(const call of mock.request.mock.calls){expect(call[0]).toBe('/api/site-operations/themes');expect(call[2].method).toBeUndefined();expect(call[2].body).toBeUndefined();}
});
it('shows published revision and review together and resolves the exact linked case',async()=>{
 const caseId='a1d5b21e-94fb-4a75-a94b-d160d5335b4c';
 const item={...items[1],caseId,currentRevision:32,publishedRevision:32};
 mock.request.mockResolvedValueOnce({items:[item]})
  .mockResolvedValueOnce({items:[{id:caseId,phase:'review',workflow:'manual',status:'blocked',updatedAt:'2026-11-21T00:00:00Z'}],nextCursor:null})
  .mockResolvedValueOnce({id:caseId,version:4,progress:{brief:'Previous review',scope:'',blockers:['Awaiting approval'],unfinished:[]},submissions:[],nextSubmissionCursor:null});
 render(<ThemeProductionOperations userId="owner" authorized/>);
 await screen.findByRole('link',{name:'Review theme'});
 expect(screen.getByRole('link',{name:'Review theme'}).closest('li')?.textContent).toContain('Published · revision 32');
 expect(within(screen.getByRole('link',{name:'Review theme'}).closest('li')!).getByText('In review')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/^Published 1/}));
 expect(screen.getByRole('link',{name:'Review theme'})).toBeTruthy();
 const disclosure=screen.getByText('Production and review cases').parentElement!;
 disclosure.setAttribute('open','');
 const select=await screen.findByRole('button',{name:'Review · Blocked · Manual'});
 fireEvent.click(select);
 await screen.findByText('Awaiting approval');
 expect(mock.request.mock.calls[1][0]).toContain('themeId=theme%3Areview');
 expect(mock.request.mock.calls[2][0]).toContain('caseId='+caseId);
});
it('does not show old private progress after access or account changes, including late responses',async()=>{
 const view=render(<ThemeProductionOperations userId="owner" authorized/>);await screen.findByRole('link',{name:'Working theme'});
 view.rerender(<ThemeProductionOperations userId="owner" authorized={false}/>);expect(screen.queryByRole('link',{name:'Working theme'})).toBeNull();
 let resolve!:(x:unknown)=>void;mock.request.mockImplementation(()=>new Promise(r=>{resolve=r;}));view.rerender(<ThemeProductionOperations userId="other" authorized/>);
 expect(screen.queryByRole('link',{name:'Working theme'})).toBeNull();view.rerender(<ThemeProductionOperations userId="other" authorized={false}/>);resolve({items});
 await waitFor(()=>expect(screen.queryByRole('link',{name:'Working theme'})).toBeNull());
});
