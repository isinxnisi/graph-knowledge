export type PersonalSection='capsules'|'settings'|'capsule-posts'|'discover'|'joined'|'invitations'|'participation'|'community-posts'|'reports'|'community-detail';
export type PersonalItem={id:PersonalSection;href:string;label:string;icon:'capsule'|'settings'|'search'|'graph'|'person'|'list'|'history'};
export function personalNavigation(locale:string,signedIn:boolean,communities=true){
 const t=(ja:string,en:string)=>locale==='en'?en:ja;
 return [
  ...(communities?[{label:t('コミュニティ','Communities'),items:[{id:'discover',href:'/communities',label:t('コミュニティを見つける','Discover communities'),icon:'search'},...(signedIn?[{id:'joined',href:'/communities#%3Fmine%3D1',label:t('参加・運営','Joined & managed'),icon:'graph'}]:[])]}]:[]),
  {label:t('アカウント','Account'),items:[{id:'capsules',href:'/member#my-capsules',label:t('自分のCapsule','My Capsules'),icon:'capsule'},...(signedIn?[...(communities?[{id:'invitations',href:'/communities#%2Finvitations',label:t('届いた招待','Received invitations'),icon:'person'}]:[]),{id:'settings',href:'/member#account-settings',label:t('アカウント設定','Account settings'),icon:'settings'}]:[])]},
  ...(signedIn?[{label:t('活動・履歴','Activity & history'),items:[...(communities?[{id:'community-posts',href:'/communities#%2Fmy-posts',label:t('コミュニティの投稿','Community posts'),icon:'history'}]:[]),{id:'capsule-posts',href:'/member#my-posts',label:t('Capsuleのコメント','Capsule comments'),icon:'history'},...(communities?[{id:'participation',href:'/communities#%2Fparticipation',label:t('参加履歴・運営復帰','Membership & continuity'),icon:'history'},{id:'reports',href:'/communities#%2Freports',label:t('自分の通報','My reports'),icon:'list'}]:[])]}]:[])
 ] as {label:string;items:PersonalItem[]}[];
}
export function personalSection(member:boolean,hash:string|null):PersonalSection|undefined{
 if(hash===null)return undefined;
 let raw='';try{raw=decodeURIComponent(hash);}catch{}
 return member?(raw==='account-settings'?'settings':raw==='my-posts'?'capsule-posts':'capsules'):raw.startsWith('/my-posts')?'community-posts':raw.startsWith('/reports')?'reports':raw.startsWith('/participation')||raw.startsWith('/recoveries')?'participation':raw.startsWith('/invitations')?'invitations':raw.includes('mine=1')?'joined':/^\/[a-f0-9-]{36}/.test(raw)||raw.startsWith('/threads/')?'community-detail':'discover';
}