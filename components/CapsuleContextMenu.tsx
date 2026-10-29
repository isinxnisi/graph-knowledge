"use client";
import { useLayoutEffect, useRef, type ComponentProps } from "react";
import Icon from "./Icon";
import css from "./CapsuleStudio.module.css";

export type CapsuleMenuAction = { label: string; icon: ComponentProps<typeof Icon>["name"]; action: () => void; disabled?: boolean; danger?: boolean };
export default function CapsuleContextMenu({ x, y, title, actions, onClose }: { x: number; y: number; title: string; actions: CapsuleMenuAction[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null), close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; }, [onClose]);
  useLayoutEffect(() => {
    const element = menu.current!;
    const prior = document.activeElement as HTMLElement | null;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => { if (!element.contains(event.target as Node)) close.current(); };
    const resize = () => close.current();
    window.addEventListener("pointerdown", outside, true); window.addEventListener("resize", resize);
    return () => { window.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", resize); if (element.contains(document.activeElement) || document.activeElement === document.body) prior?.focus(); };
  }, [x, y]);
  return <div ref={menu} role="menu" aria-label={title} className={css.contextMenu} style={{ left:x, top:y }} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); onClose(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length-1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <div className={css.menuCaption}>{title}</div>
    {actions.map(item => <button role="menuitem" key={item.label} disabled={item.disabled} data-danger={item.danger || undefined} onClick={() => { onClose(); item.action(); }}><Icon name={item.icon}/>{item.label}</button>)}
  </div>;
}
