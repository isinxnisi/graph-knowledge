import {useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject} from "react";
import type {ExplorerPane} from "./explorer-scroll";

const phoneQuery = "(max-width: 800px)";
function subscribe(listener: () => void) {
  const media = window.matchMedia(phoneQuery);
  media.addEventListener?.("change", listener);
  return () => media.removeEventListener?.("change", listener);
}
const phoneSnapshot = () => Boolean(window.matchMedia?.(phoneQuery).matches);
const serverSnapshot = () => false;

// This is a non-modal sidebar: the header and pane navigation remain usable.
// Only the obscured reading page is inert; native dialogs can still open above it.
export function useExplorerDetailDrawer(root: RefObject<HTMLDivElement | null>, pane: ExplorerPane, onDismiss: () => void) {
  const phone = useSyncExternalStore(subscribe, phoneSnapshot, serverSnapshot);
  const open = phone && pane === "detail";
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
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    detail?.focus({preventScroll:true});
    return () => {
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
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
  return {phone, open};
}
