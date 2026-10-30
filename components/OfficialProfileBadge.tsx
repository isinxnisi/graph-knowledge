import Icon from './Icon';
import css from './PublicProfile.module.css';
export default function OfficialProfileBadge({en=false}:{en?:boolean}) {
 return <span className={css.officialBadge} title={en?'Plunode official account':'Plunodeの公式アカウント'}><Icon name="shield"/>{en?'Official':'公式'}</span>;
}
