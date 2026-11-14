// Graph/search use the document on phones; the detail drawer always scrolls locally.
export type ExplorerPane = "search" | "graph" | "detail";
export function isPhoneExplorer() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(max-width: 800px)").matches);
}
export function explorerScrollTop(pane: ExplorerPane) {
  return pane === "graph" || (pane === "search" && isPhoneExplorer()) ? window.scrollY : document.getElementById(`explorer-${pane}`)?.scrollTop ?? 0;
}
export function scrollExplorerPane(pane: ExplorerPane, top: number) {
  if (!document.getElementById(`explorer-${pane}`)) return;
  if (pane === "graph" || (pane === "search" && isPhoneExplorer())) window.scrollTo({top, behavior:"instant"});
  else document.getElementById(`explorer-${pane}`)?.scrollTo({top, behavior:"instant"});
}
