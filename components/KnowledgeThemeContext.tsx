"use client";
import { useState } from "react";
import type { KnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import { useUiLocale } from "../lib/client/ui-locale";
import Icon from "./Icon";
import AnimatedDetails from "./AnimatedDetails";
import {type ThemeReadingPresentation} from "../lib/domain/theme-reading-presentation";
import {ExpandableReadingSection} from "./ReadingDetailSection";
import {themeStoryEntries,type ThemeStories} from "../lib/domain/theme-stories";
import css from "./KnowledgeThemeContext.module.css";

/** Undated knowledge belongs to the theme, independently of the chosen graph. */
export default function KnowledgeThemeContext({ records, selectedRecordId, onRead, className,presentation,stories,variant="compact" }: {
  stories?:ThemeStories; presentation?:ThemeReadingPresentation|null; records: KnowledgePublishedRecord[]; selectedRecordId: string | null; onRead: (id: string) => void; className?: string;variant?:"compact"|"list"|"collapsed"|"stories";
}) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [expanded, setExpanded] = useState(variant==="list");
  const context = records.filter((r) => variant==="stories" ? r.record.content.kind!=="relation" : r.record.content.times.length===0);
  const readings=themeStoryEntries(records.map(dto=>dto.record),stories,presentation,locale,variant==="list"?"list":"stories");
  if(variant==="stories"){
    if(!readings.length)return null;
    return <ExpandableReadingSection className={`${css.readingList} ${className ?? ""}`} title={en?"Stories & background":"エピソード・豆知識"} icon="book" items={readings.map(item=>{
      const record=item.records[0];
      return <AnimatedDetails key={item.key} className={css.story} bodyClassName={css.storyBody} summary={<><span>{record.content.polarity!=="affirmed"&&<small>{record.content.polarity==="denied"?(en?"Denied · ":"否定 · "):(en?"Uncertain · ":"不確実 · ")}</small>}{item.title}</span><Icon name="chevron"/></>}>
        {item.records.map(part=><div key={part.id}><p lang={part.content.textLanguages?.assertion?.tag}>{part.content.assertion}</p><button type="button" className={css.storyLink} data-detail-record={part.id} aria-label={`${en?"Sources & details":"出典・詳細"}：${item.title}${item.records.length>1?` · ${part.content.assertion}`:""}`} onClick={()=>onRead(part.id)}>{en?"Sources & details":"出典・詳細"}<Icon name="arrow"/></button></div>)}
      </AnimatedDetails>;
    })}/>;
  }
  if(variant==="list"){
    if(!readings.length)return null;
    return <ExpandableReadingSection className={`${css.readingList} ${className ?? ""}`} title={en?"Read more about this theme":"このテーマを深く読む"} icon="book" items={readings.map(item=><button key={item.key} data-detail-record={item.records[0].id} className={css.listRow} title={item.title} aria-label={`${en?"Read content and evidence":"内容と根拠を読む"}：${item.title}`} aria-pressed={selectedRecordId===item.records[0].id} onClick={()=>onRead(item.records[0].id)}><span>{item.records[0].content.polarity!=="affirmed"&&<small>{item.records[0].content.polarity==="denied"?(en?"Denied · ":"否定 · "):(en?"Uncertain · ":"不確実 · ")}</small>}{item.title}</span><Icon name="arrow"/></button>)}/>;
  }
  if (!context.length) return null;

  return <section className={[css.context,variant!=="compact"?css.reading:"",className].filter(Boolean).join(" ")} aria-label={en ? "Theme information" : "テーマの情報"}>
    <header><h3><Icon name="book" />{en ? "Theme information" : "テーマの情報"}<small>{context.length}{en ? " records" : "件"}</small></h3>
      {(context.length>1||variant==="collapsed") && <button className={`${css.more} ${variant==="compact"&&context.length === 2 && !expanded ? css.mobileOnly : ""}`} aria-label={expanded ? en ? "Show less" : "折りたたむ" : en ? "Read all theme information" : "テーマの情報をすべて見る"} aria-expanded={expanded} onClick={() => setExpanded((s) => !s)}>
        {expanded ? en ? "Show less" : "折りたたむ" : variant==="collapsed"?(en?`Read ${context.length} records`:`${context.length}件を読む`): <><span className={css.desktopCount}>{en ? `${context.length - 2} more` : `ほか${context.length - 2}件`}</span><span className={css.mobileCount}>{en ? `${context.length - 1} more` : `ほか${context.length - 1}件`}</span></>}<Icon name="chevron" />
      </button>}
    </header>
    <ul hidden={variant==="collapsed"&&!expanded} data-expanded={expanded || undefined}>{context.map((dto, index) => {
      const r = dto.record.content;
      const name = (id: string | null) => dto.entities.find((e) => e.id === id)?.content.name ?? "";
      return <li key={dto.record.id} className={index === 1 ? css.second : index > 1 ? css.extra : undefined}>
        <button aria-label={`${en ? "Read content and evidence" : "内容と根拠を読む"}：${r.assertion}`} aria-pressed={selectedRecordId === dto.record.id} onClick={() => onRead(dto.record.id)}>
          <span className={css.assertion}>{r.polarity !== "affirmed" && <small className={css.polarity}>{r.polarity === "denied" ? en ? "Denied" : "否定" : en ? "Uncertain" : "不確実"}</small>}{r.assertion}</span>
          {expanded && <>{r.kind === "relation" ? <span className={css.link}><Icon name="graph" />{name(r.subjectId)} <span>{r.relation}</span><Icon name="arrow" />{name(r.objectId)}</span> : <span className={css.meta}>{en ? "Context & explanation" : "背景・解説"}</span>}
            <span className={css.meta}>{en ? "Evidence" : "根拠"} {r.evidence.length} · {en ? "Content revision" : "内容版"} {dto.record.revision}<Icon name="chevron" /></span></>}
        </button>
      </li>;
    })}</ul>
  </section>;
}
