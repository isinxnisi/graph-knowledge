"use client";
import { useEffect, useRef, type ReactNode } from "react";
import css from "./CapsuleStudio.module.css";

/** The presentation host only. Draft, view, history and persistence live in the workspace. */
export default function CapsuleSurface({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const target = dialog.current;
    target?.showModal();
    return () => target?.close();
  }, []);
  return <dialog ref={dialog} className={css.surface} aria-label="Capsule" onCancel={event => event.preventDefault()}>{children}</dialog>;
}

export function CapsuleModal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const composing = useRef(false);
  useEffect(() => {
    const target=dialog.current;
    if (!target) return;
    const prior=document.activeElement instanceof HTMLElement && !target.contains(document.activeElement) ? document.activeElement : null;
    target.showModal();
    // React's mount-time autoFocus runs while the dialog is still closed.
    // Choose the editing field after showModal has made it focusable.
    target.querySelector<HTMLElement>("[data-autofocus]")?.focus({preventScroll:true});
    return () => { target.close(); if (prior?.isConnected) prior.focus({preventScroll:true}); };
  }, []);
  return <dialog ref={dialog} className={`${css.modal} ${wide ? css.wideModal : ""}`} aria-label={title}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onCancel={event => { event.preventDefault(); if (!composing.current) onClose(); }}
    onKeyDown={event => { event.stopPropagation(); }}>
    {children}
  </dialog>;
}
