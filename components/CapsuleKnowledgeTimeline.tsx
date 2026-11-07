"use client";
import type { CapsuleDocument } from "../lib/domain/capsule-document";
import { capsuleKnowledgeProjection } from "../lib/client/capsule-knowledge";
import { buildKnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import {knowledgeDisplaySnapshot} from "../lib/domain/knowledge-display";
import {useUiLocale} from "../lib/client/ui-locale";
import KnowledgeTimeline from "./KnowledgeTimeline";
import KnowledgeThemeContext from "./KnowledgeThemeContext";
import Icon from "./Icon";
import css from "./CapsuleStudio.module.css";
export default function CapsuleKnowledgeTimeline({document,focused,onFocus,onShowGraph,onToggleGraph,split}:{document:CapsuleDocument;focused:string|null;onFocus:(id:string|null)=>void;onShowGraph:(id:string)=>void;onToggleGraph:()=>void;split:boolean}){
 const {locale}=useUiLocale();const snapshot=capsuleKnowledgeProjection(document);if(!snapshot)return null;
 const display=knowledgeDisplaySnapshot(snapshot,locale),records=display.records.map(record=>buildKnowledgePublishedRecord(record,display));
 return <div className={css.knowledgeTimeline}>
  <KnowledgeThemeContext className={css.themeContext} records={records} selectedRecordId={focused} onRead={onFocus}/>
  <KnowledgeTimeline emptyMessage="関係を編集して時期を追加すると、ここに年表が表示されます。" snapshot={snapshot} focusedRecordId={focused} onFocusRecord={onFocus} untimedInContext onShowGraph={onShowGraph} headerAction={<button aria-label={split?"関係図を閉じる":"関係図を並べて表示"} aria-pressed={split} onClick={onToggleGraph}><Icon name="panel"/></button>}/>
 </div>;
}
