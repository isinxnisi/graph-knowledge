// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render} from '@testing-library/react';
const state=vi.hoisted(()=>({status:'ready',count:0}));
vi.mock('../lib/client/use-member-identity',()=>({usePendingInvitations:()=>state}));
vi.mock('../lib/client/ui-locale',()=>({useUiLocale:()=>({locale:'ja'})}));
import InvitationBadge from '../components/InvitationBadge';
afterEach(cleanup);
it('does not cover the account photo with an empty zero-count badge',()=>{
 state.status='ready';state.count=0;const {container,rerender}=render(<InvitationBadge/>);expect(container.childElementCount).toBe(0);
 state.count=2;rerender(<InvitationBadge/>);expect(container.textContent).toBe('2');expect(container.querySelector('[role=status]')?.getAttribute('aria-label')).toContain('2件');
 state.status='checking';rerender(<InvitationBadge/>);expect(container.textContent).toBe('…');
 state.status='error';rerender(<InvitationBadge/>);expect(container.textContent).toBe('!');
 state.status='ready';state.count=0;rerender(<InvitationBadge/>);expect(container.childElementCount).toBe(0);
});
