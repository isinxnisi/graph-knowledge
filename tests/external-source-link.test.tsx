// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {externalSourceTarget} from '../lib/domain/external-source-link';
import ExternalSourceLink from '../components/ExternalSourceLink';
afterEach(cleanup);
it.each(['javascript:alert(1)','data:text/html,hello','file:///tmp/a','https://user:secret@example.org/x','https://localhost/x','https://foo.local/x','https://127.1/x','https://2130706433/x','https://[::1]/x','https://[fd00::1]/x','https://169.254.169.254/x','https://192.168.1.1/x','https://example.org./x','https://example.org/\\nnext'])('blocks unsafe source navigation %s',url=>{
 expect(externalSourceTarget(url).state).toBe('blocked');
 render(<ExternalSourceLink href={url} label="資料"/>);
 expect(screen.queryByRole('link')).toBeNull();expect(screen.getByText('このリンクは開けません')).toBeTruthy();
 expect(document.body.textContent).not.toContain('secret');
});
it('shows the actual destination alongside a misleading title and prevents opener/referrer access',()=>{
 render(<ExternalSourceLink href="https://example.org/?login=plunode.net" label="Plunodeにログイン"/>);
 const a=screen.getByRole('link');expect(a.getAttribute('href')).toBe('https://example.org/?login=plunode.net');
 expect(screen.getByText('example.org')).toBeTruthy();expect(a.getAttribute('rel')).toContain('noopener');expect(a.getAttribute('rel')).toContain('noreferrer');expect(a.getAttribute('referrerpolicy')).toBe('no-referrer');
 expect(screen.queryByRole('button')).toBeNull();
});
it.each(['http://example.org/x','https://例え.テスト/x','https://8.8.8.8/x','https://example.org:8443/x'])('requires the actual destination to be opened explicitly for %s',url=>{
 const target=externalSourceTarget(url);expect(target.state).toBe('confirm');
 render(<ExternalSourceLink href={url} label="資料"/>);expect(screen.queryByRole('link')).toBeNull();
 fireEvent.click(screen.getByRole('button'));expect(screen.getByRole('group',{name:'外部リンク先の確認'})).toBeTruthy();
 expect(screen.getByRole('link',{name:/この遷移先を開く/}).getAttribute('href')).toBe(target.state!=='blocked'?target.href:null);
 if(target.state!=='blocked')expect(document.body.textContent).toContain(target.host);
});
it('never carries a confirmation over to a changed destination',()=>{
 const view=render(<ExternalSourceLink href="http://example.org/a" label="資料"/>);
 fireEvent.click(screen.getByRole('button'));expect(screen.getByRole('link')).toBeTruthy();
 view.rerender(<ExternalSourceLink href="http://another.example.org/a" label="資料"/>);expect(screen.queryByRole('link')).toBeNull();
});

it('does not print embedded credentials even when a URL was used as its own label',()=>{
 const url='https://user:secret@example.org/x';render(<ExternalSourceLink href={url} label={url}/>);
 expect(document.body.textContent).not.toContain('secret');expect(screen.queryByRole('link')).toBeNull();
});
it('isolates an untrusted bidirectional title from the actual left-to-right host',()=>{
 render(<ExternalSourceLink href="https://example.org" label={'Plunode'+String.fromCharCode(0x202e)+'moc.elpmaxe'}/>);
 const host=screen.getByText('example.org');expect(host.tagName).toBe('BDI');expect(host.getAttribute('dir')).toBe('ltr');
});
