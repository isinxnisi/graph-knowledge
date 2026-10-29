"use client";
import { createContext, useCallback, useContext, useEffect, useRef, type PointerEvent, type ReactNode, type RefObject } from "react";
import css from "./CapsuleStudio.module.css";

const SurfaceClose = createContext<((handler: () => void) => () => void) | null>(null);

/** Keep the host independent of the workspace's draft and close policy. */
export function useCapsuleSurfaceClose(handler: () => void) {
  const register = useContext(SurfaceClose);
  useEffect(() => register?.(handler), [register, handler]);
}

/** Native dialog backdrops target the dialog; its own padding does too. */
export function useCapsuleBackdrop(onDismiss: () => void, enabled = true) {
  const press = useRef<{ id: number; x: number; y: number } | null>(null);
  const composing = useRef(false);
  const outside = (event: PointerEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget || event.currentTarget.querySelector("dialog[open]")) return false;
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  return {
    composing,
    handlers: {
      onCompositionStartCapture: () => { composing.current = true; press.current = null; },
      onCompositionEndCapture: () => { composing.current = false; },
      onPointerDown: (event: PointerEvent<HTMLDialogElement>) => {
        press.current = null;
        if (event.button !== 0 || event.isPrimary === false || !outside(event)) return;
        // Retain the current focus if closing needs confirmation or is blocked.
        event.preventDefault();
        if (enabled && !composing.current) press.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      },
      onPointerUp: (event: PointerEvent<HTMLDialogElement>) => {
        const start = press.current; press.current = null;
        if (!enabled || composing.current || !start || start.id !== event.pointerId || !outside(event)
          || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
        event.preventDefault(); event.stopPropagation(); onDismiss();
      },
      onPointerCancel: () => { press.current = null; },
    },
  };
}

/** The presentation host only. Draft, view, history and persistence live in the workspace. */
export default function CapsuleSurface({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<(() => void) | null>(null);
  const register = useCallback((handler: () => void) => { close.current = handler; return () => { if (close.current === handler) close.current = null; }; }, []);
  const dismiss = () => { if (close.current) close.current(); else onClose?.(); };
  const backdrop = useCapsuleBackdrop(dismiss);
  useEffect(() => {
    const target = dialog.current;
    const prior = document.activeElement instanceof HTMLElement && !target?.contains(document.activeElement) ? document.activeElement : null;
    target?.showModal();
    return () => { target?.close(); if (prior?.isConnected) prior.focus({ preventScroll: true }); };
  }, []);
  return <SurfaceClose.Provider value={register}><dialog ref={dialog} className={css.surface} aria-label="Capsule" {...backdrop.handlers}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (event.target === event.currentTarget && !backdrop.composing.current) dismiss(); }}>{children}</dialog></SurfaceClose.Provider>;
}

export function CapsuleModal({ title, children, onClose, wide = false, dismissOnBackdrop = true, dismissible = true, dialogRef }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; dismissOnBackdrop?: boolean; dismissible?: boolean; dialogRef?: RefObject<HTMLDialogElement | null> }) {
  const localDialog = useRef<HTMLDialogElement>(null), dialog = dialogRef ?? localDialog;
  const backdrop = useCapsuleBackdrop(onClose, dismissible && dismissOnBackdrop);
  useEffect(() => {
    const target=dialog.current;
    if (!target) return;
    const prior=document.activeElement instanceof HTMLElement && !target.contains(document.activeElement) ? document.activeElement : null;
    target.showModal();
    // React's mount-time autoFocus runs while the dialog is still closed.
    // Choose the editing field after showModal has made it focusable.
    target.querySelector<HTMLElement>("[data-autofocus]")?.focus({preventScroll:true});
    return () => { target.close(); if (prior?.isConnected) prior.focus({preventScroll:true}); };
  }, [dialog]);
  return <dialog ref={dialog} className={`${css.modal} ${wide ? css.wideModal : ""}`} aria-label={title}
    {...backdrop.handlers}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (event.target === event.currentTarget && dismissible && !backdrop.composing.current) onClose(); }}
    onKeyDown={event => { event.stopPropagation(); }}>
    {children}
  </dialog>;
}
