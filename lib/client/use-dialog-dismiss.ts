"use client";
import { useEffect, useRef, type RefObject } from "react";

export function useDialogDismiss(dialog: RefObject<HTMLDialogElement | null>, onDismiss: () => void) {
  const closing = useRef<Animation | null>(null);
  useEffect(() => () => closing.current?.cancel(), []);
  return () => {
    if (closing.current) return;
    const element = dialog.current;
    if (!element?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onDismiss(); return; }
    element.setAttribute("data-motion-state", "closing");
    const animation = element.animate([{ opacity: 1, transform: "translateY(0) scale(1)" }, { opacity: 0, transform: "translateY(10px) scale(.985)" }], { duration: 160, easing: "ease-in", fill: "forwards" });
    closing.current = animation;
    animation.onfinish = () => { onDismiss(); };
  };
}
