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
export function themeTimeLabel(time: ThemeTime | null, locale: string = "ja"): string {
  const en=locale==="en";
  if (!time) return en?"No time specified":"時期の記載なし";
  let text: string;
  if (time.kind === "calendar") {
    switch (calendarMeaning(time)) {
      case "duration":
        text =
          time.startLatest || time.endEarliest
            ? en?`Duration: start ${range(time.from, time.startLatest)} · end ${range(time.endEarliest ?? time.to!, time.to)}`:`期間：開始 ${range(time.from, time.startLatest)} · 終了 ${range(time.endEarliest ?? time.to!, time.to)}`
            : en?`Duration: ${time.from} → ${time.to}`:`期間：${time.from} → ${time.to}`;
        break;
      case "occurrence-window":
        text = en?`Occurrence window: ${range(time.from,time.to)} (somewhere within this range)`:`発生時期の幅：${range(time.from, time.to)}（この間のどこか）`;
        break;
      case "unclassified-range":
        text = en?`Time range (unclassified): ${range(time.from,time.to)}`:`時期の範囲（未区別）：${range(time.from, time.to)}`;
        break;
      default:
        text = time.from;
    }
  } else if (time.kind === "cycle") {
    text = `${time.from} → ${time.to} ${time.unit}${time.wrap ? en?" (wraps)":"（折り返し）" : ""} · ${time.axis} · ${en?"Cycle":"周期"} ${time.period} ${time.unit}`;
  } else {
    text = `${range(time.from, time.to)} · ${time.axis} · ${time.coordinateMeaning}`;
  }
  return text + (time.kind==="calendar"&&time.expression?` · ${en?"Source notation: ":"原表記："}${time.expression}`:"") + (time.label ? ` · ${time.label}` : "");
}
