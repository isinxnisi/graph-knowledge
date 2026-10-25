"use client";
import {useUiLocale} from '../lib/client/ui-locale';
import {profileHref} from '../lib/domain/public-profile';
import ProfileAvatar from './ProfileAvatar';
import css from './PersonIdentity.module.css';
type Person={handle:string;displayName:string;icon:string};
export default function PersonIdentity({person,label}:{person?:Person|null;label?:string}) {
 const {locale}=useUiLocale();
 const name=person?.displayName||label||(locale==='en'?'Member':'利用者');
 const content=<><ProfileAvatar small compact icon={person?.icon??'person'}/><span>{name}</span></>;
 return person?<a className={css.person} href={profileHref(person.handle,locale)} title={name}>{content}</a>:<span className={css.person}>{content}</span>;
}
