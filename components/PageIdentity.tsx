import Icon from './Icon';
import css from './PageIdentity.module.css';
export default function PageIdentity({area,href}:{area:'community'|'account'|'activity'|'ai-lab';href?:string}){
 const label=area==='ai-lab'?'AI LAB':area.toUpperCase();
 return <div className={css.label} data-page-identity={area}><Icon name={area==='community'?'graph':area==='account'?'person':area==='ai-lab'?'lab':'history'}/><span>PLUNODE <span className={css.separator}>/</span> {href?<a href={href}>{label}</a>:<span aria-current="page">{label}</span>}</span></div>;
}
