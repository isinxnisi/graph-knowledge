import type { ThemeTime } from "./theme-workbench";

/** A drawing row is not a persisted factual Record. Old one-time records are
 * structurally compatible; common records can produce several time rows. */
export type TimelineDisplayRecord = {
  id: string;
  recordId?: string;
  timeId?: string | null;
  kind: "relation" | "episode" | "note";
  subject: string | null;
  object: string | null;
  assertion: string;
  readingTitle?: string; readingSummary?:string;
  readingContext?: {text:string;role:"background"|"importance"|"next"};
  relation: string;
  scope: string;
  polarity: "affirmed" | "denied" | "uncertain";
  time: ThemeTime | null;
  displayTime?: ThemeTime;
  revision: number;
  evidence: {
    evidenceId?: string;
    title: string;
    url: string | null;
    locator: string;
    excerpt: string;
    sourceId?: string;
    sourceRevision?: number;
    bibliography?: string;
    stance?: "support" | "refute" | "background";
  }[];
};
export type TimelineDisplayEntity = {
  id: string;
  name: string;
  kind: string;
  description: string;
  revision?: number;
};
export type TimelineTimedRow = { id: string; time: ThemeTime | null };
export const timelineRecordId = (record: Pick<TimelineDisplayRecord, "id" | "recordId">) => record.recordId ?? record.id;
