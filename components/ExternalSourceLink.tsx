'use client';
import {useState} from 'react';
import {externalSourceTarget} from '../lib/domain/external-source-link';
import Icon from './Icon';
import css from './ExternalSourceLink.module.css';

export default function ExternalSourceLink({href,label,locale='ja',onOpen,ariaLabel}:{href:string;label:string;locale?:string;onOpen?:()=>void;ariaLabel?:string}){
 const target=externalSourceTarget(href),en=locale==='en';
 const [confirmed,setConfirmed]=useState<string|null>(null);
 if(target.state==='blocked')return <span className={css.blocked}>{label===href?(en?'Source':'資料'):label}<small>{en?'Link unavailable':'このリンクは開けません'}</small></span>;
 const content=<><bdi>{label}</bdi><bdi dir="ltr" className={css.host}>{target.host}</bdi><Icon name="external"/></>;
 const link=<a href={target.href} target="_blank" rel="noopener noreferrer nofollow ugc" referrerPolicy="no-referrer" aria-label={ariaLabel?ariaLabel+' · '+target.host:undefined} onClick={onOpen}>{content}</a>;
 if(target.state==='direct')return <span className={css.root}>{link}</span>;
 return <span className={css.root}><button type="button" className={css.check} aria-expanded={confirmed===href} onClick={()=>setConfirmed(confirmed===href?null:href)}>{content}</button>{confirmed===href&&<span className={css.notice} role="group" aria-label={en?'Confirm external destination':'外部リンク先の確認'}>
  <span>{en?'Check this external destination before opening.':'開く前に、外部サイトの遷移先を確認してください。'} <strong>{target.host}</strong></span>
  {target.reasons.includes('http')&&<small>{en?'This link uses unencrypted HTTP.':'暗号化されないHTTPのリンクです。'}</small>}
  {target.reasons.includes('idn')&&<small>{en?'The internationalized domain is shown in its actual ASCII form.':'国際化ドメインを実際のASCII表記で表示しています。'}</small>}
  <a href={target.href} target="_blank" rel="noopener noreferrer nofollow ugc" referrerPolicy="no-referrer" onClick={onOpen}>{en?'Open this destination':'この遷移先を開く'} <Icon name="external"/></a>
 </span>}</span>;
}
