// @vitest-environment jsdom
import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
const route=vi.hoisted(()=>({pending:false}));
vi.mock('next/link',()=>({default:({children,href}:{children:ReactNode;href:string})=><a href={href}>{children}</a>,useLinkStatus:()=>({pending:route.pending})}));
import HeaderNavigationProgress from '../components/HeaderNavigationProgress';
import NavigationLink from '../components/NavigationLink';
import {navigationProgressSnapshot,startNavigationProgress} from '../lib/client/navigation-progress';
function Page({graphLoading=false}:{graphLoading?:boolean}){return <><header><HeaderNavigationProgress label="Loading page"/></header><NavigationLink href="/member">Account</NavigationLink>{graphLoading&&<p>Graph loading</p>}</>;}
beforeEach(()=>{vi.useFakeTimers();route.pending=false;});
afterEach(()=>{cleanup();startNavigationProgress()();vi.useRealTimers();});
it('shows only after 1.5 seconds of actual route pending and stops when the destination commits',()=>{
 route.pending=true;const view=render(<Page/>);
 act(()=>vi.advanceTimersByTime(1499));expect(screen.queryByRole('progressbar')).toBeNull();
 act(()=>vi.advanceTimersByTime(1));expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBe('Loading page');
 route.pending=false;view.rerender(<Page graphLoading/>);expect(screen.queryByRole('progressbar')).toBeNull();
 act(()=>vi.advanceTimersByTime(10000));expect(screen.getByText('Graph loading')).toBeTruthy();expect(screen.queryByRole('progressbar')).toBeNull();
});
it('never flashes for fast navigation or graph-only loading',()=>{
 route.pending=true;const view=render(<Page/>);act(()=>vi.advanceTimersByTime(1000));route.pending=false;view.rerender(<Page graphLoading/>);
 act(()=>vi.advanceTimersByTime(5000));expect(screen.queryByRole('progressbar')).toBeNull();
});
it('an obsolete completion cannot hide a newer navigation',()=>{
 render(<HeaderNavigationProgress label="Loading page"/>);let first!:()=>void,second!:()=>void;
 act(()=>{first=startNavigationProgress();});act(()=>vi.advanceTimersByTime(800));act(()=>{second=startNavigationProgress();});
 act(()=>{first();vi.advanceTimersByTime(1499);});expect(screen.queryByRole('progressbar')).toBeNull();
 act(()=>vi.advanceTimersByTime(1));expect(screen.getByRole('progressbar')).toBeTruthy();act(()=>second());expect(screen.queryByRole('progressbar')).toBeNull();
});
it('removes pending route state on unmount and cancels its delayed appearance',()=>{
 route.pending=true;const view=render(<Page/>);expect(navigationProgressSnapshot()).not.toBeNull();view.unmount();expect(navigationProgressSnapshot()).toBeNull();act(()=>vi.advanceTimersByTime(2000));expect(screen.queryByRole('progressbar')).toBeNull();
});
