import {parse,type DefaultTreeAdapterMap} from 'parse5';
export type ThemePageExpectation={id:string;language:'ja'|'en';title:string;bodyText:string;servedRevision:number;latestRevision:number};
type Node=DefaultTreeAdapterMap['node'];
const attr=(n:Node,name:string)=>'attrs' in n?n.attrs.find(a=>a.name===name)?.value:undefined;
const children=(n:Node):Node[]=>'childNodes' in n?n.childNodes:[];
function nodes(n:Node):Node[]{return [n,...children(n).flatMap(nodes)];}
function text(n:Node):string{if(n.nodeName==='#text')return 'value' in n?String(n.value):'';if(['script','style','template','head'].includes(n.nodeName))return '';return children(n).map(text).join(' ');}
const normalize=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
export function inspectThemeHtml(html:string,url:string,expected:ThemePageExpectation,headerRobots:string|null){
 const all=nodes(parse(html)),tags=(name:string)=>all.filter(n=>n.nodeName===name),canonical=tags('link').filter(n=>attr(n,'rel')==='canonical').map(n=>attr(n,'href'));
 const robotMeta=tags('meta').filter(n=>['robots','googlebot'].includes((attr(n,'name')??'').toLowerCase())).map(n=>attr(n,'content')??'');
 const lang=attr(tags('html')[0],'lang'),headings=tags('h2').map(n=>normalize(text(n))),body=normalize(tags('body').map(text).join(' '));
 const marker=all.find(n=>attr(n,'data-theme-publication-id')===expected.id),revision=marker?Number(attr(marker,'data-theme-publication-revision')):null;
 const alternates=tags('link').filter(n=>attr(n,'rel')==='alternate').map(n=>({language:attr(n,'hreflang'),url:attr(n,'href')}));
 const documentTitle=tags('title').map(n=>normalize(children(n).map(text).join(' '))),ogImages=tags('meta').filter(n=>attr(n,'property')==='og:image').map(n=>attr(n,'content'));
 const issues:string[]=[];
 if(documentTitle.length!==1||documentTitle[0]!==normalize(expected.title+' — Plunode'))issues.push('METADATA_TITLE_MISMATCH');
 const imagePath=(expected.language==='en'?'/en':'')+'/t/'+encodeURIComponent(expected.id)+'/opengraph-image';
 if(!ogImages.some(v=>{try{const u=new URL(v??'');return u.origin==='https://plunode.net'&&u.pathname===imagePath&&u.searchParams.get('revision')===String(expected.servedRevision);}catch{return false;}}))issues.push('OGP_EDITION_MISMATCH');
 if(lang!==expected.language)issues.push('LANGUAGE_MISMATCH');
 if(canonical.length!==1||canonical[0]!==url.replace('https://graph-beta.isinxnisi.com','https://plunode.net'))issues.push('CANONICAL_MISMATCH');
 if(!headings.includes(normalize(expected.title)))issues.push('TITLE_MISMATCH');
 if(!expected.bodyText||!body.includes(normalize(expected.bodyText)))issues.push('BODY_MISMATCH');
 if(revision!==expected.servedRevision)issues.push('EDITION_MISMATCH');
 const noindex=[...robotMeta,headerRobots??''].some(v=>/\b(noindex|none)\b/i.test(v));
 return {issues,evidence:{lang,canonical,robotMeta,headerRobots,noindex,documentTitle,ogImages,servedRevision:revision,headingPresent:headings.includes(normalize(expected.title)),bodyPresent:!!expected.bodyText&&body.includes(normalize(expected.bodyText)),alternates}};
}
export function robotsAllows(body:string,path:string){
 let applies=false,seenRule=false;const matches:{allow:boolean;length:number}[]=[];
 for(const raw of body.split(/\r?\n/)){const line=raw.replace(/#.*/,'').trim(),split=line.indexOf(':');if(split<0)continue;const name=line.slice(0,split).trim().toLowerCase(),value=line.slice(split+1).trim();
  if(name==='user-agent'){if(seenRule){applies=false;seenRule=false;}applies=applies||['*','googlebot'].includes(value.toLowerCase());}
  else if(name==='allow'||name==='disallow'){seenRule=true;if(!applies||!value)continue;const pattern=value.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');if(new RegExp('^'+pattern).test(path))matches.push({allow:name==='allow',length:value.length});}
 }
 return matches.sort((a,b)=>b.length-a.length||Number(b.allow)-Number(a.allow))[0]?.allow??true;
}
export async function checkThemePublication(origin:string,expectations:ThemePageExpectation[],fetcher:typeof fetch=fetch){
 const requestedAt=new Date().toISOString(),beta=origin==='https://graph-beta.isinxnisi.com';
 const get=async(path:string)=>{try{const response=await fetcher(origin+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Accept:'text/html, application/xml, text/plain'}});const raw=await response.text();if(Buffer.byteLength(raw)>6_000_000)return {code:'RESPONSE_TOO_LARGE',status:response.status};return {status:response.status,body:raw,robots:response.headers.get('x-robots-tag')};}catch(e){const code=(e as {cause?:{code?:string};code?:string}).cause?.code??(e as {code?:string}).code;return {code:['ENOTFOUND','EAI_AGAIN'].includes(code??'')?'DNS_FAILED':e instanceof Error&&/timeout|abort/i.test(e.name)?'TIMEOUT':'NETWORK_FAILED'};}};
 const [sitemap,robots,...pages]=await Promise.all([get('/sitemap.xml'),get('/robots.txt'),...expectations.map(e=>get((e.language==='en'?'/en':'')+'/t/'+encodeURIComponent(e.id)))]);
 const results=expectations.map((expected,i)=>{const path=(expected.language==='en'?'/en':'')+'/t/'+encodeURIComponent(expected.id),url=origin+path,page=pages[i];const issues:string[]=[];
  if(page.code)issues.push(page.code);else if(page.status!==200)issues.push('HTTP_ERROR');
  const inspected=page.body&&page.status===200?inspectThemeHtml(page.body,url,expected,page.robots??null):null;
  if(inspected){issues.push(...inspected.issues);if(inspected.evidence.noindex&&!beta)issues.push('UNEXPECTED_NOINDEX');if(beta&&!inspected.evidence.noindex)issues.push('BETA_INDEX_PROTECTION_MISSING');
   if(!beta&&expectations.filter(e=>e.id===expected.id).some(e=>!inspected.evidence.alternates.some(a=>a.language===e.language&&a.url===origin+(e.language==='en'?'/en':'')+'/t/'+encodeURIComponent(e.id))))issues.push('HREFLANG_MISSING');}
  const listed=sitemap.status===200&&!!sitemap.body?.includes('<loc>'+url+'</loc>');
  if(sitemap.code)issues.push('SITEMAP_'+sitemap.code);else if(sitemap.status!==200)issues.push('SITEMAP_HTTP_ERROR');else if(!beta&&!listed)issues.push('SITEMAP_MISSING');
  if(robots.code)issues.push('ROBOTS_'+robots.code);else if(robots.status!==200)issues.push('ROBOTS_HTTP_ERROR');else if(!beta&&!robotsAllows(robots.body??'',path))issues.push('ROBOTS_DISALLOWED');
  return {language:expected.language,url,httpStatus:page.status??null,ok:issues.length===0,issues,latestRevision:expected.latestRevision,servedRevision:expected.servedRevision,translationPending:expected.latestRevision!==expected.servedRevision,evidence:{...inspected?.evidence,sitemapPresent:listed}};
 });
 return {checkedAt:requestedAt,origin,ok:results.every(r=>r.ok),results,googleIndexVerified:false as const};
}
