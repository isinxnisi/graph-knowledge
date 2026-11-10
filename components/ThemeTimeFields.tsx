"use client";

import { useState } from "react";
import { calendarMeaning, themeTimeLabel } from "../lib/domain/theme-time";
import type { ThemeTime } from "../lib/domain/theme-workbench";
import css from "./ThemeWorkbench.module.css";

export default function ThemeTimeFields({ time }: { time: ThemeTime | null }) {
  const calendar = time?.kind === "calendar" ? time : null;
  const [mode, setMode] = useState(
    calendar ? calendarMeaning(calendar) : time ? "keep" : "none",
  );
  const [from, setFrom] = useState(calendar?.from ?? "");
  const [to, setTo] = useState(calendar?.to ?? "");
  const [label, setLabel] = useState(calendar?.label ?? "");
  const [startLatest, setStartLatest] = useState(calendar?.startLatest ?? "");
  const [endEarliest, setEndEarliest] = useState(calendar?.endEarliest ?? "");
  const [startUncertain, setStartUncertain] = useState(!!calendar?.startLatest);
  const [endUncertain, setEndUncertain] = useState(!!calendar?.endEarliest);
  const hasDates = !["none", "keep"].includes(mode);
  const range = hasDates && mode !== "point";
  const dateField = (
    name: string,
    title: string,
    value: string,
    change: (value: string) => void,
  ) => (
    <label>
      {title}
      <input
        required
        name={name}
        value={value}
        onChange={(e) => change(e.target.value)}
        placeholder="1903 / 1903-12 / 1903-12-01T12:20Z"
        maxLength={32}
        autoComplete="off"
      />
    </label>
  );
  return (
    <div className={css.timeFields}>
      <label>
        時期の表し方
        <select
          name="timeMode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="none">時期を定めない</option>
          {time && !calendar && <option value="keep">元の時間軸を保つ</option>}
          <option value="point">時点</option>
          <option value="duration">続いた期間</option>
          <option value="occurrence-window">この範囲のどこかで起きた</option>
          {calendar && calendarMeaning(calendar) === "unclassified-range" && (
            <option value="unclassified-range">
              元の日付の範囲を保つ
            </option>
          )}
        </select>
      </label>
      {mode === "keep" && <p className={css.caption}>{themeTimeLabel(time)}</p>}
      {hasDates && (
        <>
          <div className={css.columns}>
            {dateField(
              "from",
              mode === "point"
                ? "時点"
                : mode === "duration"
                  ? startUncertain
                    ? "開始の最も早い時期"
                    : "開始"
                  : "範囲の始め",
              from,
              setFrom,
            )}
            {range &&
              dateField(
                "to",
                mode === "duration"
                  ? endUncertain
                    ? "終了の最も遅い時期"
                    : "終了"
                  : "範囲の終わり",
                to,
                setTo,
              )}
          </div>
          {mode === "duration" && (
            <div className={css.boundaries}>
              <div>
                <label className={css.checkLabel}>
                  <input
                    type="checkbox"
                    checked={startUncertain}
                    onChange={(e) => setStartUncertain(e.target.checked)}
                  />
                  開始時期に幅がある
                </label>
                {startUncertain &&
                  dateField(
                    "startLatest",
                    "開始の最も遅い時期",
                    startLatest,
                    setStartLatest,
                  )}
              </div>
              <div>
                <label className={css.checkLabel}>
                  <input
                    type="checkbox"
                    checked={endUncertain}
                    onChange={(e) => setEndUncertain(e.target.checked)}
                  />
                  終了時期に幅がある
                </label>
                {endUncertain &&
                  dateField(
                    "endEarliest",
                    "終了の最も早い時期",
                    endEarliest,
                    setEndEarliest,
                  )}
              </div>
            </div>
          )}
          <p className={css.caption}>
            {mode === "occurrence-window"
              ? "この範囲で続いたという意味にはしません。"
              : mode === "duration"
                ? "同じ時期の出来事が、この期間に属するとは扱いません。"
                : mode === "unclassified-range"
                  ? "保存済みの範囲です。続いた期間か発生時期の幅かは、まだ指定されていません。"
                  : "年だけ・年月だけでも登録できます。"}
          </p>
          <label>
            資料の時期表記（任意）
            <input
              name="timeLabel"
              maxLength={300}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="1903年後半〜1904年前半、など"
            />
          </label>
        </>
      )}
    </div>
  );
}
