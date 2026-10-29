// 利用者向け操作の初期値。表示・DBの上限や管理ポリシーとは分離する。
export const GRAPH_INTERACTION_DEFAULTS = Object.freeze({ doubleClickMs: 300, doubleTapMs: 400, touchTapTravel: 8, touchTapHoldMs: 500 });
type Input = "mouse" | "touch";
export function isGraphTouchEvent(event?: Event): event is TouchEvent {
  return !!event && "touches" in event && "changedTouches" in event;
}

// Cytoscape does not forward native touchcancel, and a stationary second
// finger need not emit pan/zoom. Track the whole touch sequence before its
// renderer emits tap, so neither interruption can join two otherwise valid taps.
export function attachGraphTouchInput(surface: HTMLElement, cancelClicks: () => void) {
  let active: { id: number; x: number; y: number; time: number; cancelled: boolean } | null = null;
  let completed: Event | null = null;
  const cancel = () => { if (active) active.cancelled = true; completed = null; cancelClicks(); };
  const travelled = (touch?: Touch) => !touch || !active || Math.hypot(touch.clientX - active.x, touch.clientY - active.y) >= GRAPH_INTERACTION_DEFAULTS.touchTapTravel;
  const start = (event: TouchEvent) => {
    completed = null;
    if (active || event.touches.length !== 1) { cancel(); return; }
    const touch = event.touches[0];
    active = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp, cancelled: false };
  };
  const move = (event: TouchEvent) => {
    if (!active) return;
    const touch = Array.from(event.touches).find(touch => touch.identifier === active!.id);
    if (event.touches.length !== 1 || travelled(touch)) cancel();
  };
  const end = (event: TouchEvent) => {
    if (!active) return;
    const touch = Array.from(event.changedTouches).find(touch => touch.identifier === active!.id);
    if (event.touches.length || active.cancelled || travelled(touch) || event.timeStamp - active.time >= GRAPH_INTERACTION_DEFAULTS.touchTapHoldMs) cancel();
    else completed = event;
    if (!event.touches.length) active = null;
  };
  const interrupted = () => { cancel(); active = null; };
  const view = surface.ownerDocument.defaultView!;
  surface.addEventListener("touchstart", start, { capture: true, passive: true });
  view.addEventListener("touchmove", move, { capture: true, passive: true });
  view.addEventListener("touchend", end, { capture: true, passive: true });
  view.addEventListener("touchcancel", interrupted, { capture: true, passive: true });
  view.addEventListener("blur", interrupted);
  return {
    cancel,
    accept: (event: Event) => { const accepted = completed === event; completed = null; return accepted; },
    dispose: () => {
      active = null; completed = null;
      surface.removeEventListener("touchstart", start, true);
      view.removeEventListener("touchmove", move, true); view.removeEventListener("touchend", end, true);
      view.removeEventListener("touchcancel", interrupted, true); view.removeEventListener("blur", interrupted);
    },
  };
}

export function createRelationClickHandler(select: (id: string) => void, open: (id: string) => void) {
  let previous: { id: string; time: number; input: Input } | null = null;
  return {
    cancel: () => { previous = null; },
    click: (id: string, now = performance.now(), input: Input = "mouse") => {
      const interval = input === "touch" ? GRAPH_INTERACTION_DEFAULTS.doubleTapMs : GRAPH_INTERACTION_DEFAULTS.doubleClickMs;
      const double = previous?.id === id && previous.input === input && now - previous.time >= 0 && now - previous.time < interval;
      previous = double ? null : { id, time: now, input };
      if (double) open(id); else select(id);
    },
  };
}

type Actions = {
  isSelected: (id: string) => boolean;
  select: (id: string) => void;
  toggle: (id: string) => void;
  doubleClick?: (id: string) => void;
};

// 選択は即時、選択中Nodeの開閉だけ遅延する。Cytoscapeの独自dbltap判定には依存しない。
export function createNodeClickHandler(actions: Actions, doubleClickMs = GRAPH_INTERACTION_DEFAULTS.doubleClickMs) {
  let previous: { id: string; time: number; input: Input } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancelPending = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const cancel = () => { cancelPending(); previous = null; };
  const click = (id: string, now = performance.now(), input: Input = "mouse") => {
    const interval = input === "touch" ? GRAPH_INTERACTION_DEFAULTS.doubleTapMs : doubleClickMs;
    if (previous?.id === id && previous.input === input && now - previous.time >= 0 && now - previous.time < interval) {
      cancel(); actions.doubleClick?.(id); return;
    }
    cancel(); previous = { id, time: now, input };
    if (!actions.isSelected(id)) actions.select(id);
    else timer = setTimeout(() => {
      timer = null; previous = null;
      if (actions.isSelected(id)) actions.toggle(id);
    }, interval);
  };
  const selectionChanged = (id: string | null) => {
    cancelPending();
    if (previous?.id !== id) previous = null;
  };
  return { click, cancel, cancelPending, selectionChanged };
}
