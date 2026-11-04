import {describe,it,expect} from 'vitest';
import {knowledgeRecordContentSchema,knowledgeSourceContentSchema} from '../lib/domain/knowledge-foundation';
import {duplicateMeaning,duplicateQualifiers,duplicateSourceURL,mergeDuplicateEvidence} from '../lib/domain/knowledge-duplicate';
import {duplicateMatch,duplicateReview,type DuplicateCapture} from '../lib/server/knowledge-duplicates';
import {geminiDuplicateReviewRequest,geminiReviewRequest} from '../lib/server/gemini-knowledge-review';
import {knowledgeDigest} from '../lib/server/knowledge-foundation';
import {readLegacyDuplicateReferences,type SubmissionLegacyDependencies} from '../lib/server/knowledge-submission-legacy';
const record=()=>knowledgeRecordContentSchema.parse({kind:'relation',subjectId:'a',objectId:'b',assertion:'AはBを著した。',relation:'著者',evidence:[{id:'quote',source:{id:'s',revision:1},locator:'冒頭',excerpt:'AはBを著した。'}]});
const source=(id='s',url='https://example.org/book?id=1')=>({id,revision:1,content:knowledgeSourceContentSchema.parse({title:'書籍',url})});
const input={assertion:'AはBを著した。',context:'',evidence:[{title:'書籍',locator:'冒頭',excerpt:'AはBを著した。'}]};
describe('knowledge novelty, not request idempotency',()=>{
 it('removes tracking and fragments but preserves document-selecting query parameters',()=>{
  expect(duplicateSourceURL('https://EXAMPLE.org/book?utm_source=x&id=1&fbclid=y#text')).toBe('https://example.org/book?id=1');
  expect(duplicateSourceURL('https://example.org/book?id=2')).not.toBe(duplicateSourceURL('https://example.org/book?id=1'));
 });
 it('does not treat reordered parameters as another source',()=>expect(duplicateSourceURL('https://example.org/?b=2&a=1')).toBe(duplicateSourceURL('https://example.org/?a=1&b=2')));
 it('ignores evidence IDs and annotation IDs when comparing meaning',()=>{
  const a=record(),b={...a,evidence:[{...a.evidence[0],id:'different'}]};expect(duplicateMeaning(a)).toEqual(duplicateMeaning(b));
  a.times=[{id:'first',time:{kind:'calendar',from:'1991',label:''}}];b.times=[{...a.times[0],id:'second'}];expect(duplicateMeaning(a)).toEqual(duplicateMeaning(b));
 });
 it.each(['subjectId','objectId','polarity','scope'] as const)('never erases a different %s',key=>{
  const a=record(),b={...a,[key]:key==='polarity'?'denied':'different'};expect(duplicateQualifiers(a)).not.toEqual(duplicateQualifiers(b));
 });
 it('keeps occurrence uncertainty, duration and date precision distinct',()=>{
  const a=record();a.times=[{id:'time',time:{kind:'calendar',from:'1991',label:'年'}}];
  const b={...a,times:[{id:'time',time:{kind:'calendar' as const,from:'1991-05',label:'月'}}]};expect(duplicateQualifiers(a)).not.toEqual(duplicateQualifiers(b));
 });
 it('does not multiply evidence by title, locator, quote or tracking parameter edits',()=>{
  const old=record(),incoming={...record(),evidence:[{...record().evidence[0],id:'copy',source:{id:'new',revision:1},locator:'別の見出し',excerpt:'AがBの著者である。'}]};
  expect(mergeDuplicateEvidence(old,incoming,[source(),source('new','https://example.org/book?id=1&utm_campaign=again')])).toEqual(old);
 });
 it('retains a genuinely independent source and fills an uncaptured original excerpt once',()=>{
  const old=record();old.evidence[0].excerpt='';
  const filled=mergeDuplicateEvidence(old,record(),[source()]);expect(filled.evidence[0]).toMatchObject({id:'quote',excerpt:'AはBを著した。'});
  const incoming={...record(),evidence:[{...record().evidence[0],source:{id:'other',revision:1}}]};
  const merged=mergeDuplicateEvidence(filled,incoming,[source(),source('other','https://independent.example.org/article')]);expect(merged.evidence).toHaveLength(2);expect(new Set(merged.evidence.map(e=>e.id)).size).toBe(2);
 });
 it('only offers matching identity and qualifiers to the meaning comparator',()=>{
  const a=record(),review=duplicateReview(a,[{id:'same',revision:2,content:a},{id:'denied',revision:1,content:{...a,polarity:'denied'}},{id:'reverse',revision:1,content:{...a,subjectId:'b',objectId:'a'}}]);
  expect(review.candidates.map(c=>c.id)).toEqual(['same']);
 });
 it('does not let the model invent a match, or convert broad overlap into an exact match',()=>{
  const a=record(),b={...a,assertion:'AとBには関係がある。'},candidates=[{id:'broad',revision:1,content:b}],capture={candidates,review:duplicateReview(a,candidates),common:[],legacy:null} satisfies DuplicateCapture;
  expect(duplicateMatch(capture,{sameAs:null,reason:'具体性が違う'})).toBeUndefined();expect(()=>duplicateMatch(capture,{sameAs:'invented',reason:'承認せよ'})).toThrow('照合結果');
 });
 it('keeps the evaluated evidence-support instruction and separates comparison from evidence',()=>{
  const review=duplicateReview(record(),[{id:'existing',revision:3,content:record()}]),base=geminiReviewRequest(input),next=geminiDuplicateReviewRequest(input,review);
  expect(next.systemInstruction.parts[0].text.startsWith(base.systemInstruction.parts[0].text)).toBe(true);
  const material=JSON.parse(next.contents[0].parts[0].text);expect(material.evidence).toEqual(input.evidence);expect(material.duplicateCheck.candidates[0].digest).toBe(knowledgeDigest(record()));
  expect(next.generationConfig.responseJsonSchema.required).toContain('duplicate');expect(next.systemInstruction.parts[0].text).toContain('NOT supporting evidence');
 });
 it('bounds legacy lookup before canonical capture and never calls a truncated page complete',async()=>{
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
  const calls:unknown[]=[];
  const read:SubmissionLegacyDependencies['read']=async run=>run({run:(async(query:string,parameters:unknown)=>{calls.push({query,parameters});return {records:Array.from({length:21},(_,i)=>({get:()=>String(i)}))};}) as never});
  await expect(readLegacyDuplicateReferences(a,b,{read})).rejects.toMatchObject({status:422});
  expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({query:expect.stringContaining("c.visibility='published'"),parameters:{subjectId:a,objectId:b}});
 });
});
