import {useLayoutEffect, useRef} from "react";
import {isPhoneExplorer, type ExplorerPane} from "./explorer-scroll";

export function useExplorerPageLayout(pane: ExplorerPane) {
  const root = useRef<HTMLDivElement>(null);
  const currentPane = useRef(pane);
  const positions = useRef<Record<ExplorerPane, number>>({search:0, graph:0, detail:0});
  useLayoutEffect(() => {
    const element = root.current, header = element?.querySelector("header");
    if (!element || !header) return;
    const measure = () => element.style.setProperty("--explorer-header-height", `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(header);
    window.addEventListener("resize", measure);
    const capture = () => { if(currentPane.current !== "detail") positions.current[currentPane.current] = window.scrollY; };
    window.addEventListener("scroll", capture, {passive:true});
    return () => {observer?.disconnect();window.removeEventListener("resize", measure);window.removeEventListener("scroll", capture);};
  }, []);
  useLayoutEffect(() => {
    if (currentPane.current === pane) return;
    const previous = currentPane.current;
    currentPane.current = pane;
    // The phone detail is an overlay: it never owns or resets the page position.
    if (isPhoneExplorer() && pane !== "detail" && !(previous === "detail" && pane === "graph")) {
      window.scrollTo({top:positions.current[pane], behavior:"instant"});
    }
  }, [pane]);
  return root;
}
