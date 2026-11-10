"use client";

import { useMemo, type ReactNode } from "react";
import type { KnowledgeSnapshot } from "../lib/domain/knowledge-foundation";
import { knowledgeTimelineProjection } from "../lib/domain/knowledge-timeline";
import {knowledgeDisplaySnapshot} from "../lib/domain/knowledge-display";
import {useUiLocale} from "../lib/client/ui-locale";
import { timelineRecordId } from "../lib/domain/timeline-display";
import ThemeTimeline from "./ThemeTimeline";
import {readingRecordTitle,type ThemeReadingPresentation} from "../lib/domain/theme-reading-presentation";

/** The Explorer owns the selected immutable Record and the view switch. */
export default function KnowledgeTimeline({ snapshot, focusedRecordId, focusedEntityId, onFocusRecord, onShowGraph, untimedInContext = false, headerAction, emptyMessage,reading=false,presentation }: {
  snapshot: KnowledgeSnapshot;
  focusedRecordId: string | null;
  focusedEntityId?: string;
  onFocusRecord: (id: string | null,timeId?:string) => void;
  onShowGraph?: (recordId: string) => void;
  untimedInContext?: boolean;
  headerAction?: ReactNode;
  emptyMessage?: string;
  reading?:boolean;
  presentation?:ThemeReadingPresentation|null;
}) {
  const {locale}=useUiLocale();
  const projection = useMemo(() => knowledgeTimelineProjection(knowledgeDisplaySnapshot(snapshot,locale), { untimedInContext,locale }), [snapshot, locale,untimedInContext]);
  const display=knowledgeDisplaySnapshot(snapshot,locale);
  return <ThemeTimeline
    {...projection}
    records={reading?projection.records.map(row=>{
      const record=display.records.find(r=>r.id===row.recordId)!;
      const editorial=presentation?.records.find(r=>r.target.id===record.id&&r.target.revision===record.revision);
      return {...row,readingTitle:editorial?.shortTitle||row.displayTime?.label||readingRecordTitle(record,presentation),readingSummary:editorial?.timelineSummary};
    }):projection.records}
    reading={reading}
    emptyMessage={emptyMessage}
    embedded
    headerAction={headerAction}
    compactControls
    focusedRecordId={focusedRecordId}
    focusedEntityId={focusedEntityId}
    onFocusRecord={onFocusRecord}
    selectedRecordIds={[]}
    onShowGraph={onShowGraph ? record => onShowGraph(timelineRecordId(record)) : undefined}
  />;
}
