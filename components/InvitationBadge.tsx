"use client";
import {usePendingInvitations} from '../lib/client/use-member-identity';
import {useUiLocale} from '../lib/client/ui-locale';
import css from './PersonalNavigation.module.css';
export default function InvitationBadge(){const value=usePendingInvitations(),{locale}=useUiLocale();if(value.status==='ready'&&value.count===0)return null;const label=value.status==='error'?(locale==='en'?'Invitation count unavailable':'招待件数を確認できません'):value.status==='checking'?(locale==='en'?'Checking pending invitations':'対応待ちの招待を確認中'):locale==='en'?`${value.count} pending invitations`:`対応待ちの招待 ${value.count}件`;return <span className={css.badge} aria-label={label} title={label} data-pending={value.status==='ready'&&!!value.count} role="status">{value.status==='ready'?(value.count?value.count>99?'99+':value.count:''):value.status==='error'?'!':'…'}</span>;}
