import type { ThemeTime } from "./theme-workbench";

export type CalendarTime = Extract<ThemeTime, { kind: "calendar" }>;
export type CalendarMeaning =
  | "point"
  | "duration"
  | "occurrence-window"
  | "unclassified-range";

/** Interpret for display only; never upgrade an old from/to pair to a duration. */
export function calendarMeaning(time: CalendarTime): CalendarMeaning {
  return time.meaning ?? (time.to ? "unclassified-range" : "point");
}

function range(from: string | number, to: string | number | undefined) {
  return to !== undefined && to !== from ? `${from}〜${to}` : String(from);
}

/** A faithful, searchable description shared by record, Graph and Capsule views. */
export function themeTimeLabel(time: ThemeTime | null): string {
  if (!time) return "時期の記載なし";
  let text: string;
  if (time.kind === "calendar") {
    switch (calendarMeaning(time)) {
      case "duration":
        text =
          time.startLatest || time.endEarliest
            ? `期間：開始 ${range(time.from, time.startLatest)} · 終了 ${range(time.endEarliest ?? time.to!, time.to)}`
            : `期間：${time.from} → ${time.to}`;
        break;
      case "occurrence-window":
        text = `発生時期の幅：${range(time.from, time.to)}（この間のどこか）`;
        break;
      case "unclassified-range":
        text = `時期の範囲（未区別）：${range(time.from, time.to)}`;
        break;
      default:
        text = time.from;
    }
  } else if (time.kind === "cycle") {
    text = `${time.from} → ${time.to} ${time.unit}${time.wrap ? "（折り返し）" : ""} · ${time.axis} · 周期 ${time.period} ${time.unit}`;
  } else {
    text = `${range(time.from, time.to)} · ${time.axis} · ${time.coordinateMeaning}`;
  }
  return text + (time.kind==="calendar"&&time.expression?` · 原表記：${time.expression}`:"") + (time.label ? ` · ${time.label}` : "");
}
