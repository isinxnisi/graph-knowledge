import ipaddr from 'ipaddr.js';

export type ExternalSourceTarget={state:'blocked';reason:'format'|'credentials'|'local'}|{state:'direct'|'confirm';href:string;host:string;reasons:('http'|'idn'|'address'|'port')[]};
/** Navigation policy only: a visible host is not a safety certification.
 * Automatic retrieval must still use the DNS-pinned public source fetcher. */
export function externalSourceTarget(raw:string):ExternalSourceTarget{
 if(raw.length>8000||[...raw].some(ch=>{const n=ch.codePointAt(0)!;return n<=32||n===92||n>=127&&n<=159||n>=0x202a&&n<=0x202e||n>=0x2066&&n<=0x2069;}))return {state:'blocked',reason:'format'};
 let url:URL;try{url=new URL(raw);}catch{return {state:'blocked',reason:'format'};}
 if(!['https:','http:'].includes(url.protocol)||!url.hostname)return {state:'blocked',reason:'format'};
 if(url.username||url.password)return {state:'blocked',reason:'credentials'};
 const host=url.hostname.toLowerCase(),bare=host.startsWith('[')?host.slice(1,-1):host;
 const address=ipaddr.isValid(bare);
 if(address?ipaddr.process(bare).range()!=='unicast':!host.includes('.')||/(^|[.])(localhost|local|internal|home|lan)$/.test(host)||host.endsWith('.'))return {state:'blocked',reason:'local'};
 const reasons:('http'|'idn'|'address'|'port')[]=[];
 if(url.protocol==='http:')reasons.push('http');
 if(host.split('.').some(part=>part.startsWith('xn--')))reasons.push('idn');
 if(address)reasons.push('address');
 if(url.port)reasons.push('port');
 return {state:reasons.length?'confirm':'direct',href:url.href,host:url.host,reasons};
}
