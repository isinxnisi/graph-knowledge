"use client";

import { useMemo, type ReactNode } from "react";
import type { KnowledgeSnapshot } from "../lib/domain/knowledge-foundation";
import { knowledgeTimelineProjection } from "../lib/domain/knowledge-timeline";
import { timelineRecordId } from "../lib/domain/timeline-display";
import ThemeTimeline from "./ThemeTimeline";

/** The Explorer owns the selected immutable Record and the view switch. */
export default function KnowledgeTimeline({ snapshot, focusedRecordId, onFocusRecord, onShowGraph, untimedInContext = false, headerAction, emptyMessage }: {
  snapshot: KnowledgeSnapshot;
  focusedRecordId: string | null;
  onFocusRecord: (id: string | null) => void;
  onShowGraph?: (recordId: string) => void;
  untimedInContext?: boolean;
  headerAction?: ReactNode;
  emptyMessage?: string;
}) {
  const projection = useMemo(() => knowledgeTimelineProjection(snapshot, { untimedInContext }), [snapshot, untimedInContext]);
  return <ThemeTimeline
    {...projection}
    emptyMessage={emptyMessage}
    embedded
    headerAction={headerAction}
    compactControls
    focusedRecordId={focusedRecordId}
    onFocusRecord={onFocusRecord}
    selectedRecordIds={[]}
    onShowGraph={onShowGraph ? record => onShowGraph(timelineRecordId(record)) : undefined}
  />;
}
