"use client";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import {useUiLocale} from "../lib/client/ui-locale";
import css from "./KnowledgeSplit.module.css";

/** Two views of one theme; resizing never replaces either view's state. */
export default function KnowledgeSplit({ mode, children, fill = false }: { fill?: boolean; mode: "graph" | "timeline" | "split"; children: ReactNode[] }) {
  const {locale}=useUiLocale(),en=locale==="en";
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(50);
  const clamp = (value: number) => Math.max(30, Math.min(70, value));
  return <div ref={frame} className={css.frame} data-view={mode} data-fill={fill || undefined} style={{ "--timeline-width": `${width}%` } as CSSProperties}>
    {children[0]}
    <div className={css.divider} role="separator" tabIndex={mode === "split" ? 0 : -1} aria-label={en?"Resize timeline and relation diagram":"年表と関係図の幅を調整"} aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={width} aria-valuetext={en?`Timeline ${Math.round(width)}%, relation diagram ${Math.round(100-width)}%`:`年表 ${Math.round(width)}%、関係図 ${Math.round(100 - width)}%`} title={en?"Drag or use arrow keys to resize; double-click to split equally":"ドラッグまたは左右キーで幅を調整・ダブルクリックで等分"}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = frame.current?.getBoundingClientRect(); if (rect?.width) setWidth(clamp((event.clientX - rect.left) / rect.width * 100)); }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onDoubleClick={() => setWidth(50)}
      onKeyDown={event => { const next = event.key === "ArrowLeft" ? width - 2 : event.key === "ArrowRight" ? width + 2 : event.key === "Home" ? 30 : event.key === "End" ? 70 : event.key === "Enter" ? 50 : null; if (next !== null) { event.preventDefault(); setWidth(clamp(next)); } }} />
    {children[1]}
  </div>;
}
