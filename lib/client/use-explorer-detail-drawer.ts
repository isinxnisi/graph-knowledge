import {useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject} from "react";
import type {ExplorerPane} from "./explorer-scroll";

const serverSnapshot = () => false;

// This is a non-modal sidebar: the header and pane navigation remain usable.
// Only the obscured reading page is inert; native dialogs can still open above it.
export function useExplorerDetailDrawer(root: RefObject<HTMLDivElement | null>, pane: ExplorerPane, onDismiss: () => void, theme = false) {
  // Themes lose their side-by-side detail below 1200px; normal Graph keeps it on tablets.
  const query = theme ? "(max-width: 1199px)" : "(max-width: 800px)";
  const subscribe = useCallback((listener: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener?.("change", listener);
    return () => media.removeEventListener?.("change", listener);
  }, [query]);
  const snapshot = useCallback(() => Boolean(window.matchMedia?.(query).matches), [query]);
  const overlay = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const open = overlay && pane === "detail";
  const dismiss = useRef(onDismiss);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { dismiss.current = onDismiss; });
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const host = root.current;
    const detail = host.querySelector<HTMLElement>("#explorer-detail");
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = [...host.querySelectorAll<HTMLElement>("#explorer-graph, #explorer-search, [data-explorer-footer]")];
    const previousInert = background.map(element => Boolean(element.inert));
    background.forEach(element => { element.inert = true; });
    const htmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    // Lock the document only: body overflow would become the sticky header
    // scroll ancestor and move it offscreen when the page is already scrolled.
    detail?.focus({preventScroll:true});
    return () => {
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [open, root]);
  useEffect(() => {
    if (!open) return;
    const detail = root.current?.querySelector<HTMLElement>("#explorer-detail");
    const trigger = returnFocus.current;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      dismiss.current();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      // Restore after React commits inert/visibility, unless another control owns focus.
      if (detail?.contains(document.activeElement) && trigger?.isConnected && !trigger.closest("[inert]")) trigger.focus({preventScroll:true});
    };
  }, [open, root]);
  return {overlay, open};
}
