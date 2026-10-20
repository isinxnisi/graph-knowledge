// Isolated experience model. Fixtures, not production authorization.
export const text = (ja,en) => ({ja,en});
export function fixture() {
 return {serial:10, epoch:0, viewer:'aya',notifications:{}, communities:[
 {id:'atelier',name:text('つながりの読書室','The connection room'),note:text('ひとつの作品から、まだ知らないつながりへ。気になった一冊や、小さな発見を持ち寄る場所。','A place for books, unexpected connections, and small discoveries. Bring your curiosity.'),visibility:'public',join:'open',status:'active',members:{aya:'admin',ren:'member',mio:'member'},ai:{policy:'invited',activity:'mention',external:false,roles:['summary']},aiJoined:false},
 {id:'studio',name:text('物語の下書き室','Story workshop'),note:text('まだまとまらない考えを、少人数で。成果だけを外へ届けられます。','An intimate space for unfinished ideas. Share the outcome when it is ready.'),visibility:'private',join:'invite',status:'active',members:{aya:'admin',ren:'member',mio:'member'},ai:{policy:'none',activity:'mention',external:false,roles:[]},aiJoined:false}],
 capsules:[
 {id:'c1',owner:'mio',revision:2,title:text('物語をつなぐ、つくり手の線','The people between stories'),note:text('作品と制作担当者の接点を、三つの視点から眺める。','Three perspectives on the connections between works and their creators.'),published:[1],grants:[],deleted:false},
 {id:'c2',owner:'aya',revision:3,title:text('研究所をめぐる小さな旅','A journey through research institutes'),note:text('場所を共有した人々の、異なる研究の道。','Different paths in research, connected by a shared place.'),published:[2],grants:[],deleted:false},
 {id:'c3',owner:'aya',revision:2,title:text('非公開の検討ノート','Private research notes'),note:text('公開前の仮説と共同検討。公開用の版では説明を選び直します。','Working hypotheses. Prepare a separate description before publishing.'),published:[],grants:[{community:'studio',revision:2,audience:['aya','ren','mio']}],deleted:false}],
 revisions:[
 {capsule:'c1',revision:1,title:text('物語をつなぐ、つくり手の線','The people between stories'),note:text('作品と制作担当者の接点を、三つの視点から眺める。','Three perspectives on works and their creators.')},
 {capsule:'c2',revision:2,title:text('研究所をめぐる小さな旅','A journey through research institutes'),note:text('場所を共有した人々の、異なる研究の道。','Different paths in research, connected by a shared place.')},
 {capsule:'c3',revision:2,title:text('非公開の検討ノート','Private research notes'),note:text('非公開の仮説。外部に送信しない。','Private hypothesis. Do not send outside this space.')}],
 listings:[{id:'l1',community:'atelier',capsule:'c1',revision:1,by:'mio',audience:'public',featured:true},{id:'l2',community:'atelier',capsule:'c2',revision:2,by:'aya',audience:'public',featured:false},{id:'l3',community:'studio',capsule:'c3',revision:2,by:'aya',audience:['aya','ren','mio'],featured:false},{id:'l4',community:'studio',capsule:'c1',revision:1,by:'ren',audience:['aya','ren','mio'],featured:false}],
 threads:[
 {id:'t1',community:'atelier',title:text('同じ作品を、違う角度から読む','Reading the same work from different angles'),audience:'public',posts:[{id:'p1',by:'ren',body:text('正解を決める前に、面白かった接点を一つずつ持ち寄りませんか。','Before deciding on an answer, let’s bring one interesting connection each.'),ref:{capsule:'c1',revision:1}}]},
 {id:'t2',community:'studio',title:text('公開する説明を、一緒に考える','Finding the words to share'),audience:['aya','ren','mio'],posts:[{id:'p2',by:'ren',body:text('この会話はここに残して、確かめられた成果だけ公開しましょう。','Keep this conversation here and share only the outcome we can support.'),ref:{capsule:'c3',revision:2}}]}],jobs:[],audit:[],contributions:[{submission:'s1',decision:'accepted',eventScope:'public',capsule:'c1',revision:1,claim:'fixture-claim-1',community:'atelier'},{submission:'s1',decision:'accepted',eventScope:'public',capsule:'c1',revision:1,claim:'fixture-claim-1',community:'atelier'}]};
}
export const users={aya:'Aya',ren:'Ren',mio:'Mio',guest:'Visitor'};
export const community=(s,id)=>s.communities.find(c=>c.id===id);
export const isMember=(s,c)=>!!c?.members[s.viewer];
export const isAdmin=(s,c)=>c?.members[s.viewer]==='admin';
export const canReadCommunity=(s,c)=>!!c && (c.visibility==='public'||isMember(s,c));
export const canWrite=(s,c)=>isMember(s,c)&&c.status==='active';
export function canReadRevision(s,id,revision,communityId) {
 const c=s.capsules.find(c=>c.id===id);
 if (!c||c.deleted||!s.revisions.some(r=>r.capsule===id&&r.revision===revision)) return false;
 if(c.owner===s.viewer||c.published.includes(revision)) return true;
 return c.grants.some(g=>g.community===communityId&&g.revision===revision&&g.audience.includes(s.viewer)&&isMember(s,community(s,communityId)));
}
export const hasListingGrant=(s,id,revision,cid)=>{const cap=s.capsules.find(c=>c.id===id&&!c.deleted);return !!cap&&(cap.published.includes(revision)||cap.grants.some(g=>g.community===cid&&g.revision===revision&&g.audience.length>0));};
export function visibleListings(s,cid) {
 if(!canReadCommunity(s,community(s,cid))) return [];
 return s.listings.filter(l=>l.community===cid&&(l.audience==='public'||(isMember(s,community(s,cid))&&l.audience.includes(s.viewer)))&&canReadRevision(s,l.capsule,l.revision,cid));
}
export function visibleThreads(s,cid) {
 if(!canReadCommunity(s,community(s,cid)))return [];
 return s.threads.filter(t=>t.community===cid&&(t.audience==='public'||(isMember(s,community(s,cid))&&t.audience.includes(s.viewer))));
}
export function reference(s,ref,cid) {
 if(!ref||!canReadRevision(s,ref.capsule,ref.revision,cid)) return null;
 return s.revisions.find(r=>r.capsule===ref.capsule&&r.revision===ref.revision);
}
export function publicContributionCount(s,cid=null) {
 return new Set(s.contributions.filter(x=>(!cid||x.community===cid)&&x.decision==='accepted'&&x.eventScope==='public'&&s.capsules.find(c=>c.id===x.capsule&&!c.deleted&&c.published.includes(x.revision))?.id&&community(s,x.community)?.visibility==='public').map(x=>`${x.submission}:${x.claim}`)).size;
}
function revokeAudience(s,cid,user){for(const t of s.threads)if(t.community===cid&&Array.isArray(t.audience))t.audience=t.audience.filter(u=>u!==user);for(const l of s.listings)if(l.community===cid&&Array.isArray(l.audience))l.audience=l.audience.filter(u=>u!==user);for(const cap of s.capsules)for(const g of cap.grants)if(g.community===cid)g.audience=g.audience.filter(u=>u!==user);}
function requireThat(condition){if(!condition)throw Error('NOT_ALLOWED');}
export function act(state,action) {
 const s=structuredClone(state), c=community(s,action.community), cap=s.capsules.find(x=>x.id===action.capsule);
 const id=prefix=>`${prefix}${++s.serial}`;
 switch(action.type){
 case 'create':{
 requireThat(s.viewer!=='guest'&&action.name?.trim()&&['public','private'].includes(action.visibility));
 const cid=id('community'); s.communities.push({id:cid,name:text(action.name.trim(),action.name.trim()),note:text(action.note||'',action.note||''),visibility:action.visibility,join:action.visibility==='public'?'open':'invite',status:'active',members:{[s.viewer]:'admin'},ai:{policy:'invited',activity:'mention',external:false,roles:['summary']},aiJoined:false}); s.created=cid;break;}
 case 'mute':requireThat(isMember(s,c));s.notifications[`${s.viewer}:${c.id}`]=!s.notifications[`${s.viewer}:${c.id}`];break;
 case 'join':requireThat(s.viewer!=='guest'&&c?.visibility==='public'&&c.join==='open'&&c.status==='active');c.members[s.viewer]??='member';break;
 case 'leave':requireThat(isMember(s,c));if(isAdmin(s,c)&&Object.values(c.members).filter(r=>r==='admin').length===1)c.status='archived';delete c.members[s.viewer];revokeAudience(s,c.id,s.viewer);break;
 case 'archive':requireThat(isAdmin(s,c));c.status='archived';break;
 case 'restore':requireThat(isAdmin(s,c));c.status='active';break;
 case 'visibility':requireThat(isAdmin(s,c)&&['public','private'].includes(action.value));if(action.value==='private'){for(const item of [...s.threads,...s.listings])if(item.community===c.id&&item.audience==='public')item.audience=Object.keys(c.members);}c.visibility=action.value;c.join=action.value==='public'?'open':'invite';break;
 case 'member':requireThat(isAdmin(s,c)&&action.user!==s.viewer&&['admin','member','remove'].includes(action.value));if(action.value==='remove'){delete c.members[action.user];revokeAudience(s,c.id,action.user);}else c.members[action.user]=action.value;break;
 case 'invite':requireThat(isAdmin(s,c)&&users[action.user]&&action.user!=='guest');c.members[action.user]='member';break;
 case 'list':requireThat(canWrite(s,c)&&cap&&!cap.deleted&&canReadRevision(s,cap.id,action.revision,c.id));requireThat(hasListingGrant(s,cap.id,action.revision,c.id));requireThat(c.visibility!=='public'||cap.published.includes(action.revision));if(!s.listings.some(l=>l.community===c.id&&l.capsule===cap.id&&l.revision===action.revision))s.listings.push({id:id('l'),community:c.id,capsule:cap.id,revision:action.revision,by:s.viewer,audience:c.visibility==='public'?'public':Object.keys(c.members),featured:false});break;
 case 'unlist':{const l=s.listings.find(x=>x.id===action.listing);requireThat(l&&l.community===c.id&&(isAdmin(s,c)||l.by===s.viewer));s.listings=s.listings.filter(x=>x.id!==l.id);break;}
 case 'feature':{const l=s.listings.find(x=>x.id===action.listing);requireThat(isAdmin(s,c)&&l?.community===c.id);l.featured=!l.featured;break;}
 case 'updateListing':{const l=s.listings.find(x=>x.id===action.listing);requireThat(l&&l.community===c.id&&(isAdmin(s,c)||l.by===s.viewer));requireThat(cap?.id===l.capsule&&cap.published.includes(action.revision));l.revision=action.revision;break;}
 case 'publish':requireThat(cap?.owner===s.viewer&&!cap.deleted&&action.title?.trim()&&action.confirmed===true);cap.revision++;cap.title=text(action.title,action.title);cap.note=text(action.note||'',action.note||'');s.revisions.push({capsule:cap.id,revision:cap.revision,title:text(action.title,action.title),note:text(action.note||'',action.note||'')});cap.published.push(cap.revision);break;
 case 'revoke':requireThat(cap?.owner===s.viewer);cap.published=cap.published.filter(r=>r!==action.revision);cap.grants=cap.grants.filter(g=>g.revision!==action.revision);break;
 case 'grant':requireThat(cap?.owner===s.viewer&&!cap.deleted&&canWrite(s,c)&&c.visibility==='private');if(!s.revisions.some(r=>r.capsule===cap.id&&r.revision===cap.revision))s.revisions.push({capsule:cap.id,revision:cap.revision,title:cap.title,note:cap.note});cap.grants.push({community:c.id,revision:cap.revision,audience:Object.keys(c.members)});break;
 case 'deleteCapsule':requireThat(cap?.owner===s.viewer);cap.deleted=true;cap.published=[];cap.grants=[];break;
 case 'thread':requireThat(canWrite(s,c)&&action.title?.trim());s.threads.push({id:id('t'),community:c.id,title:text(action.title,action.title),audience:c.visibility==='public'?'public':Object.keys(c.members),posts:[]});break;
 case 'post':{const t=visibleThreads(s,c?.id).find(t=>t.id===action.thread);requireThat(canWrite(s,c)&&t&&action.body?.trim());t.posts.push({id:id('p'),by:s.viewer,body:text(action.body,action.body),ref:action.ref||null});break;}
 case 'withdraw':{const t=s.threads.find(t=>t.id===action.thread),p=t?.posts.find(p=>p.id===action.post);requireThat(p?.by===s.viewer);p.body=null;p.ref=null;break;}
 case 'ai':requireThat(isAdmin(s,c)&&['none','invited','approved'].includes(action.policy)&&['mention','scheduled'].includes(action.activity));c.ai={policy:action.policy,activity:action.activity,external:!!action.external,roles:action.roles.filter(r=>['summary','conversation','verification'].includes(r))};break;
 case 'inviteAI':requireThat(isAdmin(s,c)&&c.ai.policy!=='none'&&c.status==='active');c.aiJoined=true;break;
 case 'queueAI':requireThat(canWrite(s,c)&&c.aiJoined&&c.ai.policy!=='none');s.jobs.push({id:id('job'),community:c.id,epoch:s.epoch+1,requestedBy:s.viewer,status:'waiting'});break;
 case 'finishAI':{const j=s.jobs.find(j=>j.id===action.job);requireThat(j&&j.status==='waiting');const jc=community(s,j.community);j.status=j.epoch===s.epoch&&jc?.status==='active'&&jc.aiJoined&&jc.ai.policy!=='none'&&jc.members[j.requestedBy]?'ready':'cancelled';break;}
 default:throw Error('UNKNOWN_ACTION');
 }
 s.epoch++; s.audit.push({type:action.type,by:s.viewer,community:c?.id||s.created});return s;
}
// Delayed results are bound to both identity and authorization generation.
export const capture = s => ({epoch:s.epoch,viewer:s.viewer});
export const accept = (s,ticket) => ticket.epoch===s.epoch&&ticket.viewer===s.viewer;
