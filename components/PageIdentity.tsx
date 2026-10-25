import Icon from './Icon';
import css from './PageIdentity.module.css';
export default function PageIdentity({area,href}:{area:'community'|'account'|'activity';href?:string}){
 return <div className={css.label} data-page-identity={area}><Icon name={area==='community'?'graph':area==='account'?'person':'history'}/><span>PLUNODE <span className={css.separator}>/</span> {href?<a href={href}>{area.toUpperCase()}</a>:<span aria-current="page">{area.toUpperCase()}</span>}</span></div>;
}
