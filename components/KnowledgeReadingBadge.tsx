import Icon from "./Icon";
import type {KnowledgeRecordContent} from "../lib/domain/knowledge-foundation";
import css from "./KnowledgeReadingDetail.module.css";
export default function KnowledgeReadingBadge({kind,polarity="affirmed",en=false,label,showKind=true}:{showKind?:boolean;label?:string;kind:KnowledgeRecordContent["kind"]|"entity"|"theme";polarity?:KnowledgeRecordContent["polarity"];en?:boolean}){
 const names=en?{episode:"Event",relation:"Relation",note:"Background",entity:"Subject",theme:"Theme"}:{episode:"出来事",relation:"関係",note:"背景・解説",entity:"対象",theme:"テーマ"};
 if(!showKind&&polarity==="affirmed")return null;
 return <span className={css.badges}>{showKind&&<span className={css.kind}><Icon name={kind==="relation"||kind==="entity"?"graph":kind==="episode"?"event":"book"}/>{label??names[kind]}</span>}{polarity!=="affirmed"&&<span className={css.status} data-state={polarity}>{polarity==="denied"?(en?"Denied":"否定"):(en?"Uncertain":"不確実")}</span>}</span>;
}
