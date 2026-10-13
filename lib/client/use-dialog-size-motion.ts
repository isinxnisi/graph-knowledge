"use client";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

// 非同期の本文差し替えを、描画前に以前の高さから補間する。自然な高さは固定しない。
export function useDialogSizeMotion(dialog: RefObject<HTMLDialogElement | null>, content: unknown) {
  const previous = useRef(0);
  const running = useRef<Animation | null>(null);
  useEffect(() => {
    previous.current = dialog.current?.offsetHeight ?? 0;
    return () => running.current?.cancel();
  }, [dialog]);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element?.open) return;
    const start = running.current ? element.offsetHeight : previous.current;
    running.current?.cancel();
    running.current = null;
    const end = element.offsetHeight;
    previous.current = end;
    if (!element.animate || !start || Math.abs(end - start) < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = element.animate([{ height: `${start}px` }, { height: `${end}px` }], { duration: 240, easing: "cubic-bezier(.2,.7,.2,1)" });
    running.current = animation;
    animation.onfinish = () => { if (running.current === animation) running.current = null; };
  }, [dialog, content]);
}
