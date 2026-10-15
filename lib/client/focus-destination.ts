// Keep semantic focus and reading order; visual indication follows input modality.
export function focusDestination(element: HTMLElement | null | undefined, options: FocusOptions = { preventScroll: true }) {
  if (!element) return;
  if (element.tabIndex === -1 && !element.matches("button, a, input, select, textarea, [contenteditable]")) element.dataset.focusDestination = "true";
  element.focus(options);
}
