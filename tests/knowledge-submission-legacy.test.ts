import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {readSubmissionLegacyReferences,type SubmissionLegacyDependencies} from "../lib/server/knowledge-submission-legacy";
import {legacyDigest} from "../lib/domain/knowledge-legacy";
import {contributionProperties} from "../lib/domain/contribution";
import {organizationParticipationProperties} from "../lib/domain/organization-participation";
import {eventProperties,eventParticipationProperties} from "../lib/domain/event-participation";
import {dateProperties} from "../lib/domain/dates";
import {validateFixture} from "../lib/domain/fixture";
const sample=JSON.parse(readFileSync(new URL("../docs/research/issue75-foundation/legacy-sample.json",import.meta.url),"utf8"));
const fixture=validateFixture(sample.fixture),revision="release-canonical-test";
const entity=(id:string)=>{const e=fixture.entities.find(e=>e.id===id)!;const {externalIds:_ids,event,...raw}=e;void _ids;return {...raw,...eventProperties(event??null)};};
function dependency(options:{missing?:boolean;changed?:boolean}={}){
 let revisionReads=0;const calls:string[]=[];
 const read:SubmissionLegacyDependencies["read"]=async action=>action({run:(async(query:string,params?:Record<string,unknown>)=>{
  calls.push(query);let values:Record<string,unknown>[]=[];
  if(query.includes("DatasetState"))values=[{release:revision,revision:options.changed&&revisionReads++>0?"changed":revision}];
  else if(query.includes("c:Claim")&&!options.missing){const c=fixture.claims.find(c=>c.id===params?.id)!;const {subjectId,objectId,period,contribution,organizationParticipation,eventParticipation,...raw}=c;
   const citations=fixture.citations.filter(e=>e.claimId===c.id).map(e=>{const source=fixture.sources.find(s=>s.id===e.sourceId)!;const {publishedAt,...sourceRaw}=source;const {claimId:_claim,sourceId:_source,roleEvidence,positionEvidence,eventParticipationEvidence,...citationRaw}=e;void _claim;void _source;return {source:{...sourceRaw,...dateProperties("publishedAt",publishedAt)},citation:{...citationRaw,roleOriginalText:roleEvidence?.originalText,roleOriginalLanguage:roleEvidence?.language,positionOriginalText:positionEvidence?.originalText,positionOriginalLanguage:positionEvidence?.language,eventOriginalText:eventParticipationEvidence?.originalText,eventOriginalLanguage:eventParticipationEvidence?.language}};});
   values=[{claim:{...raw,...contributionProperties(contribution??null),...organizationParticipationProperties(organizationParticipation??null),...eventParticipationProperties(eventParticipation??null),...dateProperties("validFrom",period.from),...dateProperties("validTo",period.to)},subject:entity(subjectId),object:entity(objectId),sourceCount:{toNumber:()=>new Set(citations.map(c=>c.source.id)).size},citations}];
  }else if(query.includes("e:Entity")&&!options.missing)values=[{entity:entity(String(params?.id))}];
  return {records:values.map(v=>({get:(key:string)=>v[key]}))};
 }) as never});return {read,calls};
}
it("captures canonical UUIDs, typed roles, sources and verifiable raw payloads without writes",async()=>{
 const deps=dependency(),claim=fixture.claims[0],result=await readSubmissionLegacyReferences({revision,entityIds:[],claimIds:[claim.id]},deps);
 expect(result.entities.map(e=>e.id).sort()).toEqual([claim.subjectId,claim.objectId].sort());
 expect(result.records[0]).toMatchObject({id:claim.id,revision:1});
 expect(result.records[0].content.relation).not.toBe("");expect(result.records[0].content.evidence.every(e=>e.excerpt==="")).toBe(true);
 expect(result.legacy.records[0].payload.claim).toEqual(claim);
 expect(result.legacy.records[0].sha256).toBe(legacyDigest(result.legacy.records[0].payload));
 expect(deps.calls.every(q=>!/(CREATE|MERGE|DELETE|SET )/.test(q))).toBe(true);
});
it("supports entity-only selection and refuses absent or changed public references",async()=>{
 const id=fixture.entities[0].id,result=await readSubmissionLegacyReferences({revision,entityIds:[id],claimIds:[]},dependency());
 expect(result.entities[0].id).toBe(id);expect(result.records).toEqual([]);
 await expect(readSubmissionLegacyReferences({revision,entityIds:[id],claimIds:[]},dependency({missing:true}))).rejects.toMatchObject({status:404});
 await expect(readSubmissionLegacyReferences({revision,entityIds:[id],claimIds:[]},dependency({changed:true}))).rejects.toMatchObject({status:409});
});

it("hashes each canonical claim independently of other selected claims and endpoint context",async()=>{
 const first=fixture.claims[0].id,second=fixture.claims[1].id;
 const one=await readSubmissionLegacyReferences({revision,entityIds:[],claimIds:[first]},dependency());
 const many=await readSubmissionLegacyReferences({revision,entityIds:fixture.entities.map(e=>e.id),claimIds:[second,first]},dependency());
 expect(many.legacy.records.find(r=>r.id===first)).toEqual(one.legacy.records[0]);
});
