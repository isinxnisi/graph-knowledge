import {expect,it} from 'vitest';
import {canonicalSourceUrl,sourceDocumentKey,verifiedSourceDocumentKey,proofMatchesSourceUrl} from '../lib/domain/knowledge-source-identity';

it('compares documents without modifying the submitted source, or discarding document-selecting parameters',()=>{
 const source={url:'https://EXAMPLE.org/article?b=2&utm_source=x&a=1#section',bibliography:'原書'};
 expect(sourceDocumentKey(source)).toBe('url:https://example.org/article?a=1&b=2');
 expect(source.url).toContain('utm_source=x');
 expect(sourceDocumentKey({...source,url:'https://example.org/article?a=3&b=2'})).not.toBe(sourceDocumentKey(source));
 expect(sourceDocumentKey({url:null,bibliography:'  ＢＯＯＫ\n Vol. 1 '})).toBe('bibliography:book vol. 1');
 expect(sourceDocumentKey({url:null,bibliography:source.url})).not.toBe(sourceDocumentKey(source));
});
it('requires the same extraction policy and a complete content hash',()=>{
 const proof={textSha256:'a'.repeat(64),extractor:'public-text-v1'};
 expect(verifiedSourceDocumentKey(proof)).not.toBe(verifiedSourceDocumentKey({...proof,extractor:'other-extractor'}));
 expect(verifiedSourceDocumentKey({...proof,textSha256:'claimed-hash'})).toBeNull();
 expect(verifiedSourceDocumentKey({...proof,extractor:''})).toBeNull();
});
it('matches the verified requested URL through a redirect while retaining both addresses',()=>{
 const proof={url:'https://publisher.example.org/final?id=1',requestedUrl:'https://example.org/start?id=1&utm_source=x',extractor:'public-text-v1',textSha256:'a'.repeat(64)};
 expect(proofMatchesSourceUrl(proof,'https://example.org/start?id=1#quote')).toBe(true);
 expect(proofMatchesSourceUrl(proof,'https://publisher.example.org/final?id=1')).toBe(true);
 expect(proofMatchesSourceUrl(proof,'https://example.org/start?id=2')).toBe(false);
 expect(proof.url).toBe('https://publisher.example.org/final?id=1');
});
