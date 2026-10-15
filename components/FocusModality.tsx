"use client";
import { useEffect } from "react";
// focus-visible can inherit keyboard indication when focus is moved by script.
// Capture input before UI handlers, including controls that stop propagation.
export default function FocusModality() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.inputModality = "initial";
    const pointer = () => { root.dataset.inputModality = "pointer"; };
    const keyboard = (event: KeyboardEvent) => {
      if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) root.dataset.inputModality = "keyboard";
    };
    // Keyboard and assistive-technology activation can dispatch click without pointerdown.
    const activation = (event: MouseEvent) => { if (event.detail === 0 && !("pointerType" in event && event.pointerType)) root.dataset.inputModality = "keyboard"; };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("click", activation, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("click", activation, true);
      delete root.dataset.inputModality;
    };
  }, []);
  return null;
}
