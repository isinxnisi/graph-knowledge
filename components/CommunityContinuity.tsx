"use client";
import PageIdentity from "./PageIdentity";
import {useState} from 'react';
import {z} from 'zod';
import {communityResponse} from '../lib/domain/community';
import type {MemberUser} from '../lib/client/member-api';
import css from './CommunityPage.module.css';
type Data=z.infer<typeof communityResponse>;
import type {CommunityMutation as Mutation} from '../lib/client/use-community-session';
import {CommunityMark} from './CommunityPrimitives';

import {CommunityDialog} from './CommunityDialog';
export default function CommunityContinuity({data,user,busy,route,t,mutate}:{data:Data,user:MemberUser|null,busy:boolean,route:string,t:(ja:string,en:string)=>string,mutate:Mutation}){
 const [copied,setCopied]=useState(false);
 const [target,setTarget]=useState(''),[days,setDays]=useState(7),[readmission,setReadmission]=useState(false);
 const [confirmation,setConfirmation]=useState<{path:string;input:Record<string,unknown>;kind:'request'|'cancel';id:string}|null>(null);
 const c=data.community;
 const state=(value:string)=>({pending:t('返答待ち','Pending'),accepted:t('参加承諾済み','Accepted'),declined:t('辞退済み','Declined'),revoked:t('取消済み','Cancelled'),expired:t('期限切れ','Expired'),unavailable:t('利用できません','Unavailable'),approved:t('運営承認済み・就任待ち','Approved · awaiting consent'),rejected:t('承認されませんでした','Not approved'),cancelled:t('取消済み','Cancelled'),consumed:t('就任済み','Completed'),active:t('参加中','Joined'),left:t('自主退出','Left'),removed:t('管理者による除外','Removed'),suspended:t('参加権停止','Suspended')}[value]??value);
 return <>
 {confirmation&&<CommunityDialog title={confirmation.kind==='request'?t('運営復帰の申請を確認','Confirm recovery request'):t('申請の取消を確認','Confirm cancellation')} busy={busy} onCancel={()=>setConfirmation(null)}><p>{t('対象コミュニティID','Community ID')}: <code>{confirmation.id}</code></p><p>{confirmation.kind==='request'?t('申請だけで管理権は付与されません。サイト運営者の判断後、本人による承諾と場所の再開が別途必要です。以前の限定会話の権限は戻りません。','A request does not grant administration. Operator review, your acceptance and reopening are separate. Earlier restricted conversations remain inaccessible.'):t('この運営復帰申請を取り消します。コミュニティや他のメンバーは削除されません。','Cancel this recovery request. The community and other members will not be deleted.')}</p><div className={css.actions}><button disabled={busy} onClick={()=>setConfirmation(null)}>{t('戻る','Go back')}</button><button className={css.primary} disabled={busy} onClick={async()=>{const result=await mutate(confirmation.path,confirmation.input);if(result.ok)setConfirmation(null);}}>{confirmation.kind==='request'?t('申請を確定','Submit request'):t('取消を確定','Confirm cancellation')}</button></div></CommunityDialog>}
 {data.invitations&&<section>
 <header className={css.heading}><div>{!c&&<PageIdentity area="account"/>}{c?<h2>{t('招待の管理','Manage invitations')}</h2>:<h1>{t('届いた招待','Your invitations')}</h1>}<p>{t('参加するかどうかは、招待を受けた本人が選べます。','Every invitation is yours to accept or decline.')}</p></div></header>
 {!c&&user&&<p className={css.identity}>{t('招待用アカウントID','Your account ID for invitations')}: <code>{user.id}</code> <button onClick={async()=>{try{await navigator.clipboard.writeText(user.id);setCopied(true);}catch{setCopied(false);}}}>{copied?t('コピー済み','Copied'):t('コピー','Copy')}</button></p>}
 {c&&c.role==='admin'&&<form className={css.form} onSubmit={e=>{e.preventDefault();void mutate('/'+c.id+'/invitations',{expectedRevision:c.revision,userId:target,days,readmission});}}>
 <p>{t('相手から共有されたアカウントIDを指定します。発行だけでは参加権は増えず、本人の承諾が必要です。','Use the account ID shared by the invitee. Issuing an invitation grants no access; the invitee must accept.')}</p>
 <label>{t('招待先アカウントID','Invitee account ID')}<input required pattern="[a-fA-F0-9-]{36}" value={target} onChange={e=>setTarget(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false}/></label>
 <fieldset><legend>{t('有効期間','Valid for')}</legend>{[1,7,30].map(d=><label key={d}><input type="radio" checked={days===d} onChange={()=>setDays(d)}/>{d}{t('日',d===1?' day':' days')}</label>)}</fieldset>
 <label><input type="checkbox" checked={readmission} onChange={e=>setReadmission(e.target.checked)}/>{t('除外・停止後の再参加として明示的に受け入れる','Explicitly readmit a removed or suspended membership')}</label>
 <p>{t('同じ相手へ再発行すると、古い招待を取り消します。過去の限定会話は共有されません。メール送信は行いません。','Reissuing cancels the previous invitation. Past restricted threads stay restricted. No email is sent.')}</p>
 <button disabled={busy||c.status!=='active'} className={css.primary}>{t('招待を発行・再発行','Issue / reissue invitation')}</button>
 </form>}
 {data.invitations.length===0&&<p>{t('招待はありません。','No invitations.')}</p>}
 {data.invitations.map(i=><article className={css.row} key={i.id}><div className={css.placeInfo}><CommunityMark name={i.title??'·'}/><div><strong>{i.title??t('コミュニティへの招待','Community invitation')}</strong><small>{state(i.status)} · {new Date(i.expiresAt).toLocaleDateString()}</small>{c&&<small>{t('宛先','To')}: {i.targetId}</small>}{i.readmission&&<small>{t('再受入・過去の限定会話は含みません','Readmission · excludes past restricted threads')}</small>}</div></div><div className={css.actions}>
 {i.status==='pending'&&(c?<button disabled={busy} onClick={()=>void mutate('/invitations/'+i.id+'/revoke',{expectedRevision:i.revision})}>{t('取り消す','Cancel invitation')}</button>:<><button disabled={busy} className={css.primary} onClick={()=>void mutate('/invitations/'+i.id+'/accept',{expectedRevision:i.revision})}>{t('承諾して参加','Accept & join')}</button><button disabled={busy} onClick={()=>void mutate('/invitations/'+i.id+'/decline',{expectedRevision:i.revision})}>{t('辞退','Decline')}</button></>)}
 {!c&&i.status==='accepted'&&<a href={'#'+encodeURIComponent('/'+i.communityId)}>{t('コミュニティへ','Visit community')} →</a>}
 </div></article>)}
 </section>}
 {data.participation&&<section><PageIdentity area="activity"/><h1>{t('参加履歴と運営の継続','Membership & continuity')}</h1><p>{t('退出・除外・停止後の権限は自動で戻りません。非公開の場所の現在の名前は表示しません。','Leaving, removal or suspension does not automatically restore access. Current private community names stay hidden.')}</p>
 {!data.participation.length&&<p className={css.empty}>{t('参加履歴はありません。','No membership history yet.')}</p>}{data.participation.map(m=><article className={css.row} key={m.communityId}><div className={css.placeInfo}><CommunityMark name={m.title??'·'}/><div><strong>{m.title??t('以前参加した場所','A previous community')}</strong><small>{state(m.status)}</small><code>{m.communityId}</code></div></div><div className={css.actions}>{m.status==='active'&&<a href={'#'+encodeURIComponent('/'+m.communityId)}>{t('この場所へ','Visit')} →</a>}{m.canRequestRecovery&&<button disabled={busy} onClick={()=>setConfirmation({path:'/'+m.communityId+'/recovery',input:{},kind:'request',id:m.communityId})}>{t('運営復帰を申請','Request administration recovery')}</button>}</div></article>)}
 <p>{t('管理者不在の場所はアーカイブを保ちます。申請はサイト運営者の判断を待ち、承認後に本人が就任を承諾します。','Communities without an administrator stay archived. A request awaits a site operator decision, followed by your explicit consent.')}</p>
 <a href={'#'+encodeURIComponent('/recoveries')}>{t('運営復帰の申請状況','Administration recovery requests')} →</a></section>}
 {data.recoveries&&<section><PageIdentity area="activity"/><h1>{t('運営復帰の申請状況','Administration recovery requests')}</h1>{data.recoveries.length===0&&<p>{t('申請はありません。','No requests.')}</p>}{data.recoveries.map(r=><article className={css.row} key={r.id}><div><strong>{state(r.status)}</strong><small>{r.communityId}</small>{r.readmissionRequired&&<small>{t('再受入を含む運営復帰申請','Recovery request includes explicit readmission')}</small>}</div><div className={css.actions}>{r.status==='approved'&&<button disabled={busy} className={css.primary} onClick={()=>void mutate('/recoveries/'+r.id+'/accept',{expectedRevision:r.revision})}>{t('承諾して管理者に就任','Accept administrator role')}</button>}{['pending','approved'].includes(r.status)&&<button disabled={busy} onClick={()=>setConfirmation({path:'/recoveries/'+r.id+'/cancel',input:{expectedRevision:r.revision},kind:'cancel',id:r.communityId})}>{t('申請を取り消す','Cancel request')}</button>}</div></article>)}<p>{t('承認には別途サイト運営者による確認が必要です。就任しても過去の限定会話は戻らず、場所の再開も別操作です。','A site operator must review the request. Taking the role does not restore old restricted threads or automatically reopen the community.')}</p></section>}
 {route.startsWith('/participation')&&<a href={'#'+encodeURIComponent('?mine=1')}>← {t('参加・運営へ','Joined & managed')}</a>}
 </>;
}
