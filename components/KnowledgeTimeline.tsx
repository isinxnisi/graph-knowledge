"use client";

import { useMemo, type ReactNode } from "react";
import type { KnowledgeSnapshot } from "../lib/domain/knowledge-foundation";
import { knowledgeTimelineProjection } from "../lib/domain/knowledge-timeline";
import {knowledgeDisplaySnapshot} from "../lib/domain/knowledge-display";
import {useUiLocale} from "../lib/client/ui-locale";
import { timelineRecordId } from "../lib/domain/timeline-display";
import ThemeTimeline from "./ThemeTimeline";

/** The Explorer owns the selected immutable Record and the view switch. */
export default function KnowledgeTimeline({ snapshot, focusedRecordId, focusedEntityId, onFocusRecord, onShowGraph, untimedInContext = false, headerAction, emptyMessage }: {
  snapshot: KnowledgeSnapshot;
  focusedRecordId: string | null;
  focusedEntityId?: string;
  onFocusRecord: (id: string | null) => void;
  onShowGraph?: (recordId: string) => void;
  untimedInContext?: boolean;
  headerAction?: ReactNode;
  emptyMessage?: string;
}) {
  const {locale}=useUiLocale();
  const projection = useMemo(() => knowledgeTimelineProjection(knowledgeDisplaySnapshot(snapshot,locale), { untimedInContext }), [snapshot, locale,untimedInContext]);
  return <ThemeTimeline
    {...projection}
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
