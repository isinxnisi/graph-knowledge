"use client";
import { useLayoutEffect, type RefObject } from "react";

// Nested dialogs share one lock. A child closing must not unlock its parent,
// and the final close restores the page rather than a keyboard-shifted offset.
let locks = 0;
let restorePage: (() => void) | undefined;
function lockPage() {
  if (locks++ === 0) {
    const body = document.body, root = document.documentElement;
    const x = window.scrollX, y = window.scrollY;
    const properties = ["position", "top", "left", "width", "overflow", "padding-right"];
    const saved = properties.map(key => [key, body.style.getPropertyValue(key), body.style.getPropertyPriority(key)]);
    const overflow = root.style.overflow, overscroll = root.style.overscrollBehavior;
    const gap = Math.max(0, window.innerWidth - root.clientWidth);
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    Object.assign(body.style, { position: "fixed", top: `${-y}px`, left: `${-x}px`, width: "100%", overflow: "hidden" });
    if (gap) body.style.paddingRight = `${padding + gap}px`;
    root.style.overflow = "hidden"; root.style.overscrollBehavior = "none";
    restorePage = () => {
      for (const [key, value, priority] of saved) { if (value) body.style.setProperty(key, value, priority); else body.style.removeProperty(key); }
      root.style.overflow = overflow; root.style.overscrollBehavior = overscroll;
      if (window.scrollX !== x || window.scrollY !== y) window.scrollTo({ left: x, top: y, behavior: "instant" });
    };
  }
  return () => { if (--locks === 0) { restorePage?.(); restorePage = undefined; } };
}

export function useModalViewport(ref: RefObject<HTMLDialogElement | null>) {
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const unlock = lockPage(), viewport = window.visualViewport;
    const place = () => {
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      // Some iOS versions retain a stale offset after dismissing the keyboard.
      // At normal scale the visible viewport cannot extend below the layout.
      const top = viewport?.scale && viewport.scale !== 1 ? viewport.offsetTop
        : Math.min(viewport?.offsetTop ?? 0, Math.max(0, window.innerHeight - height));
      dialog.style.setProperty("--dialog-width", `${width}px`);
      dialog.style.setProperty("--dialog-height", `${height}px`);
      dialog.style.left = `${(viewport?.offsetLeft ?? 0) + width / 2}px`;
      dialog.style.top = `${top + height / 2}px`;
    };
    place();
    window.addEventListener("resize", place);
    viewport?.addEventListener("resize", place); viewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", place); viewport?.removeEventListener("scroll", place);
      unlock();
    };
  }, [ref]);
}
