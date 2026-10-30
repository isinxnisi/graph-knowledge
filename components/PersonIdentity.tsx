"use client";
import {useUiLocale} from '../lib/client/ui-locale';
import {profileHref} from '../lib/domain/public-profile';
import OfficialProfileBadge from './OfficialProfileBadge';
import ProfileAvatar from './ProfileAvatar';
import css from './PersonIdentity.module.css';
type Person={handle:string;displayName:string;icon:string;official?:boolean;imageUrl?:string|null};
export default function PersonIdentity({person,label,quiet=false,showHandle=false}:{person?:Person|null;label?:string;quiet?:boolean;showHandle?:boolean}) {
 const {locale}=useUiLocale();
 const name=person?.displayName||label||(locale==='en'?'Member':'利用者');
 const content=<><ProfileAvatar small compact icon={person?.icon??'person'} imageUrl={person?.imageUrl}/><span>{name}{showHandle&&person&&<small>@{person.handle}</small>}</span>{person?.official&&<OfficialProfileBadge en={locale==='en'}/>}</>;
 return person?<a className={`${css.person} ${quiet?css.quiet:""}`} href={profileHref(person.handle,locale)} title={name}>{content}</a>:<span className={`${css.person} ${quiet?css.quiet:""}`}>{content}</span>;
}
