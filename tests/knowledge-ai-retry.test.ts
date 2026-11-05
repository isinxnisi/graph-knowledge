import {expect,it} from 'vitest';
import {aiFailureDiagnostic,reviewRetryAt} from '../lib/server/knowledge-ai-retry';
const now=new Date('2026-11-05T10:00:00Z');
it('uses durable exponential backoff with bounded jitter and a one-hour normal ceiling',()=>{
 expect([1,2,3,4,5,6,99].map(n=>(reviewRetryAt(n,null,now,.5).getTime()-now.getTime())/1000)).toEqual([120,240,480,960,1920,3600,3600]);
 expect(reviewRetryAt(1,null,now,0).getTime()-now.getTime()).toBe(102000);
 expect(reviewRetryAt(1,null,now,1).getTime()-now.getTime()).toBe(138000);
 expect(reviewRetryAt(100,null,now,1).getTime()-now.getTime()).toBe(3600000);
});
it('honors numeric or date Retry-After without allowing immediate retries or an unbounded wait',()=>{
 expect(reviewRetryAt(1,'600',now,.5).toISOString()).toBe('2026-11-05T10:10:00.000Z');
 expect(reviewRetryAt(1,'Thu, 05 Nov 2026 11:00:00 GMT',now,.5).toISOString()).toBe('2026-11-05T11:00:00.000Z');
 expect(reviewRetryAt(1,'garbage',now,.5).getTime()-now.getTime()).toBe(120000);
 expect(reviewRetryAt(1,'9999999',now,.5).getTime()-now.getTime()).toBe(86400000);
});
it('retains status and category without provider error bodies or arbitrary retry headers',()=>{
 const diagnostic=aiFailureDiagnostic({state:'http-error',status:503,category:'unavailable',retryAfter:'secret-key',raw:{error:{message:'private-data'}}});
 expect(diagnostic).toMatchObject({kind:'attempt-failure',httpStatus:503,category:'unavailable',retryAfter:null});
 const dated=aiFailureDiagnostic({state:'http-error',status:503,category:'unavailable',retryAfter:'Thu, 05 Nov 2026 11:00:00 GMT (private-token)',raw:null});
 expect(dated).toMatchObject({retryAfter:'Thu, 05 Nov 2026 11:00:00 GMT'});
 expect(JSON.stringify(diagnostic)).not.toContain('private');expect(JSON.stringify(diagnostic)).not.toContain('secret');
 expect(aiFailureDiagnostic({state:'received',status:200,raw:{}})).toBeNull();
 expect(aiFailureDiagnostic({state:'not-sent'})).toBeNull();
});
