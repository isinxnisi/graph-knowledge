// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {parseLabArtifact} from '../lib/server/ai-lab-artifact';
import AiLabEducation from '../components/AiLabEducation';
import {labRecordReturn,rememberLabDeparture} from '../lib/client/ai-lab-navigation';
const cycles=parseLabArtifact(readFileSync('docs/verification/ai-lab-autonomous-20261027/public-artifact.json')).payload.education!.cycles;
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();sessionStorage.clear();history.replaceState(null,'','/');});
it('英語の根拠URLをcanonicalに揃え、教育記録・既存run選択を保って往復できる',()=>{
  vi.stubGlobal('requestAnimationFrame',()=>0);vi.stubGlobal('cancelAnimationFrame',()=>{});
  history.replaceState(null,'','/en/ai-lab?run=old-run&filter=inference#records');render(<AiLabEducation cycles={cycles} en/>);
  fireEvent.click(screen.getAllByTestId('education-cycle')[0]);
  const href=screen.getAllByRole('link',{name:'Read Claim and evidence →'})[0].getAttribute('href')!;
  expect(href).toMatch(/^\/en\?read=claim&dataset=public-kg&id=/);expect(location.search).toContain('run=old-run');expect(location.search).toContain('cycle=891edfc6');
  const record=location.pathname+location.search+location.hash;rememberLabDeparture(href);history.replaceState(null,'',href);
  vi.spyOn(document,'referrer','get').mockReturnValue(location.origin+record);expect(labRecordReturn()).toBe(record);
  expect(screen.getByRole('heading',{name:'Holdout comparison'})).toBeTruthy();expect(screen.getByText('Carlo Rubbia',{exact:false})).toBeTruthy();
});
it('合成テストには関係探索の教育・能力改善の実績がないことを明示する',()=>{
  vi.stubGlobal('requestAnimationFrame',()=>0);vi.stubGlobal('cancelAnimationFrame',()=>{});
  render(<AiLabEducation cycles={cycles} en={false}/>);fireEvent.click(screen.getAllByTestId('education-cycle')[2]);
  expect(screen.getByText(/関係探索の教育・実推論回数・能力向上の実績には含めません/)).toBeTruthy();
  expect(screen.queryByRole('heading',{name:'holdoutの比較'})).toBeNull();
});
