"use client";
import {useSubmissionNotifications} from "../lib/client/use-submission-notifications";
import {usePendingInvitations} from "../lib/client/use-member-identity";
import {useUiLocale} from "../lib/client/ui-locale";
import {useKnowledgeSubmissionsEnabled} from "./KnowledgeSubmissionAvailability";
import css from "./PersonalNavigation.module.css";
function Badge({count,label}:{count:number;label:string}){return count>0?<span className={css.badge} data-pending="true" aria-label={label} title={label} role="status">{count>99?"99+":count}</span>:null;}
export default function SubmissionFeedbackBadge(){
 const enabled=useKnowledgeSubmissionsEnabled(),value=useSubmissionNotifications(enabled),{locale}=useUiLocale(),count=value.data?.unreadCount??0;
 return <Badge count={count} label={locale==="en"?`${count} submissions with new results`:`知識の投稿に新しい確認結果 ${count}件`}/>;
}
export function AccountUpdatesBadge({invitationsEnabled}:{invitationsEnabled:boolean}){
 const enabled=useKnowledgeSubmissionsEnabled(),feedback=useSubmissionNotifications(enabled),invitations=usePendingInvitations(),{locale}=useUiLocale();
 const results=feedback.data?.unreadCount??0,invites=invitationsEnabled&&invitations.status==="ready"?invitations.count??0:0;
 const label=locale==="en"?`${results} submissions with new results · ${invites} pending invitations`:`知識の確認結果 ${results}件・対応待ちの招待 ${invites}件`;
 return <Badge count={results+invites} label={label}/>;
}
