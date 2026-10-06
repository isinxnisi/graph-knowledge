"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

function isBackdrop(event: MouseEvent<HTMLDialogElement> | PointerEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}

// 内側から外側へドラッグした操作や、dialog内の余白クリックでは閉じない。
export function useDialogBackdrop(onDismiss: () => void) {
  const startedOutside = useRef(false);
  return {
    onPointerDown: (event: PointerEvent<HTMLDialogElement>) => { startedOutside.current = isBackdrop(event); },
    onPointerCancel: () => { startedOutside.current = false; },
    onClick: (event: MouseEvent<HTMLDialogElement>) => {
      const dismiss = startedOutside.current && isBackdrop(event);
      startedOutside.current = false;
      if (dismiss) onDismiss();
    },
  };
}
