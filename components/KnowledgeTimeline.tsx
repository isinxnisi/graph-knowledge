"use client";

import { useMemo, type ReactNode } from "react";
import type { KnowledgeSnapshot } from "../lib/domain/knowledge-foundation";
import { knowledgeTimelineProjection } from "../lib/domain/knowledge-timeline";
import {knowledgeDisplaySnapshot} from "../lib/domain/knowledge-display";
import {useUiLocale} from "../lib/client/ui-locale";
import { timelineRecordId } from "../lib/domain/timeline-display";
import ThemeTimeline from "./ThemeTimeline";
import { readingRecordEditorial, type ThemeReadingPresentation } from "../lib/domain/theme-reading-presentation";

/** The Explorer owns the selected immutable Record and the view switch. */
export default function KnowledgeTimeline({ snapshot, focusedRecordId, focusedEntityId, onFocusRecord, onShowGraph, untimedInContext = false, headerAction, emptyMessage,reading=false,presentation, mobileDocumentFlow=false }: {
  snapshot: KnowledgeSnapshot;
  focusedRecordId: string | null;
  focusedEntityId?: string;
  onFocusRecord: (id: string | null,timeId?:string) => void;
  onShowGraph?: (recordId: string) => void;
  untimedInContext?: boolean;
  headerAction?: ReactNode;
  emptyMessage?: string;
  reading?:boolean;
  mobileDocumentFlow?: boolean;
  presentation?:ThemeReadingPresentation|null;
}) {
  const {locale}=useUiLocale();
  const projection = useMemo(() => knowledgeTimelineProjection(knowledgeDisplaySnapshot(snapshot, locale), {
    untimedInContext, locale, themeReading: reading,
  }), [snapshot, locale, untimedInContext, reading]);
  return <ThemeTimeline
    {...projection}
    records={reading?projection.records.map(row=>{
      const editorial = readingRecordEditorial(presentation, timelineRecordId(row), row.revision);
      return { ...row, readingTitle: editorial?.shortTitle || row.assertion, readingSummary: editorial?.timelineSummary, readingImage: editorial?.image };
    }):projection.records}
    reading={reading}
    emptyMessage={emptyMessage}
    embedded
    mobileDocumentFlow={mobileDocumentFlow}
    headerAction={headerAction}
    compactControls
    focusedRecordId={focusedRecordId}
    focusedEntityId={focusedEntityId}
    onFocusRecord={onFocusRecord}
    selectedRecordIds={[]}
    onShowGraph={onShowGraph ? record => onShowGraph(timelineRecordId(record)) : undefined}
  />;
}
