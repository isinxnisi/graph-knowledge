import css from './PublicProfile.module.css';
export default function ProfileAvatar({icon,small=false}:{icon:string;small?:boolean}) {
  const src=icon==='official-ai'?(small?'/ai/official-small.png':'/ai/official-profile.png'):icon==='apprentice-ai'?'/ai-lab/apprentice-profile.png':null;
  return <span className={small?css.smallAvatar:css.avatar} aria-hidden="true">{src?
    // Fixed same-origin assets only. Provider images are never used.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={small?36:112} height={small?36:112}/>:<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">{icon==='leaf'?<><path d="M25 6C8 4 4 17 11 23S27 21 25 6Z"/><path d="m8 27 13-14"/></>:icon==='star'?<path d="m16 4 3.6 7.5 8.4 1.2-6 5.9 1.4 8.4-7.4-4-7.4 4 1.4-8.4-6-5.9 8.4-1.2Z"/>:icon==='orbit'?<><circle cx="16" cy="16" r="5"/><ellipse cx="16" cy="16" rx="14" ry="7" transform="rotate(-35 16 16)"/></>:<><circle cx="16" cy="11" r="5"/><path d="M6 28v-3a10 10 0 0 1 20 0v3"/></>}</svg>}</span>;
}
