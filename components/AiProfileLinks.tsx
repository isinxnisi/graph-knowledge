"use client";
import {usePublicProfilesEnabled} from './PublicProfileAvailability';
import {useUiLocale} from '../lib/client/ui-locale';
import {profileHref,AI_PROFILE_HANDLES,OFFICIAL_AI_KEY} from '../lib/domain/public-profile';
import {APPRENTICE_AI_ID} from '../lib/domain/ai-lab';
import ProfileAvatar from './ProfileAvatar';
import css from './PublicProfile.module.css';
export default function AiProfileLinks(){const enabled=usePublicProfilesEnabled(),{locale}=useUiLocale();if(!enabled)return null;return <nav className={css.actions} aria-label={locale==='en'?'AI profiles':'AIのプロフィール'}><a className={css.row} href={profileHref(AI_PROFILE_HANDLES[OFFICIAL_AI_KEY],locale)}><ProfileAvatar small icon="official-ai"/>{locale==='en'?'Plunode official AI':'Plunode公式AI'} →</a><a className={css.row} href={profileHref(AI_PROFILE_HANDLES[APPRENTICE_AI_ID],locale)}><ProfileAvatar small icon="apprentice-ai"/>{locale==='en'?'Apprentice exploration AI':'探索者見習いAI'} →</a></nav>;}
