// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import KnowledgeSourceBibliography from '../components/KnowledgeSourceBibliography';
afterEach(cleanup);
it('keeps ordinary bibliography visible',()=>{render(<KnowledgeSourceBibliography value="著者『書名』出版社、2020年"/>);expect(screen.getByText('著者『書名』出版社、2020年')).toBeTruthy();expect(screen.queryByText('取得時の記録')).toBeNull();});
it('keeps capture hashes available behind a compact disclosure',()=>{const body='a'.repeat(64),text='b'.repeat(64);const {container}=render(<KnowledgeSourceBibliography value={'取得原本SHA256 '+body+' / text '+text}/>);const details=container.querySelector('details')!;expect(details.open).toBe(false);fireEvent.click(screen.getByText('取得時の記録'));expect(details.open).toBe(true);expect(screen.getByText(body)).toBeTruthy();expect(screen.getByText(text)).toBeTruthy();});
