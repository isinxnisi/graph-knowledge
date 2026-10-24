import Icon from './Icon';
import css from './PageIdentity.module.css';
export default function PageIdentity({area}:{area:'community'|'account'|'activity'}){
 return <div className={css.label} data-page-identity={area}><Icon name={area==='community'?'graph':area==='account'?'person':'history'}/><span>PLUNODE <span className={css.separator}>/</span> {area.toUpperCase()}</span></div>;
}