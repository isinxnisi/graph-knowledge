import type {KnowledgeSourceContent} from './knowledge-foundation';

/** Comparison keys, never permission to fetch or navigate to a URL. Retrieval
 * must still enforce HTTPS, public addresses and each redirect boundary. */
export function canonicalSourceUrl(raw:string){
 const url=new URL(raw);url.hash='';
 for(const key of [...url.searchParams.keys()])if(/^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i.test(key))url.searchParams.delete(key);
 url.searchParams.sort();return url.href;
}
export function sourceDocumentKey(source:Pick<KnowledgeSourceContent,'url'|'bibliography'>){
 return source.url?'url:'+canonicalSourceUrl(source.url):'bibliography:'+source.bibliography.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase();
}
export type VerifiedSourceIdentity={url:string;requestedUrl?:string;textSha256:string;extractor:string};
/** Hashes from different extraction policies are not comparable. Callers must
 * obtain these proofs from verified fetches, never an external package claim. */
export function verifiedSourceDocumentKey(proof:Pick<VerifiedSourceIdentity,'textSha256'|'extractor'>){
 return /^[a-f0-9]{64}$/.test(proof.textSha256)&&proof.extractor?JSON.stringify([proof.extractor,proof.textSha256]):null;
}
export function proofMatchesSourceUrl(proof:VerifiedSourceIdentity,url:string){
 const key=canonicalSourceUrl(url);
 return [proof.requestedUrl,proof.url].some(value=>value&&canonicalSourceUrl(value)===key);
}
