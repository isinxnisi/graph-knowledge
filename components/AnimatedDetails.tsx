"use client";
import { useEffect, useRef, type ReactNode } from "react";

// native detailsの意味とキーボード操作を残し、高さ補間をブラウザのCSS対応に依存させない。
export default function AnimatedDetails({ summary, children, className, bodyClassName, open = false }: {
  summary: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; open?: boolean;
}) {
  const animation = useRef<Animation | null>(null);
  const destination = useRef<boolean | null>(null);
  useEffect(() => () => animation.current?.cancel(), []);
  return <details open={open} className={className} data-animated-disclosure>
    <summary onClick={event => {
      event.preventDefault();
      const details = event.currentTarget.parentElement as HTMLDetailsElement;
      const target = !(destination.current ?? details.open);
      const start = details.getBoundingClientRect().height;
      animation.current?.cancel();
      destination.current = target;
      const body = details.lastElementChild as HTMLElement;
      const finish = () => {
        details.open = target;
        details.style.removeProperty("height");
        details.style.removeProperty("overflow");
        delete details.dataset.motionState;
        body.inert = false;
        destination.current = null;
        animation.current = null;
      };
      if (!details.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { finish(); return; }
      details.style.removeProperty("height");
      details.open = true;
      const css = getComputedStyle(details);
      const closedHeight = event.currentTarget.getBoundingClientRect().height + [css.paddingTop, css.paddingBottom, css.borderTopWidth, css.borderBottomWidth].reduce((sum, n) => sum + parseFloat(n || "0"), 0);
      const end = target ? details.getBoundingClientRect().height : closedHeight;
      details.dataset.motionState = target ? "opening" : "closing";
      body.inert = !target;
      if (!target && body.contains(document.activeElement)) event.currentTarget.focus();
      details.style.overflow = "clip";
      const running = details.animate([{ height: `${start}px` }, { height: `${end}px` }], { duration: 240, easing: "cubic-bezier(.2,.7,.2,1)" });
      animation.current = running;
      running.onfinish = finish;
    }}>{summary}</summary>
    <div className={bodyClassName}>{children}</div>
  </details>;
}
