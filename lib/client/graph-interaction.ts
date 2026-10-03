// 利用者向け操作の初期値。表示・DBの上限や管理ポリシーとは分離する。
export const GRAPH_INTERACTION_DEFAULTS = Object.freeze({ doubleClickMs: 300 });

type Actions = {
  isSelected: (id: string) => boolean;
  select: (id: string) => void;
  toggle: (id: string) => void;
  doubleClick?: (id: string) => void;
};

// 選択は即時、選択中Nodeの開閉だけ遅延する。Cytoscapeの独自dbltap判定には依存しない。
export function createNodeClickHandler(actions: Actions, doubleClickMs = GRAPH_INTERACTION_DEFAULTS.doubleClickMs) {
  let previous: { id: string; time: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancelPending = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const cancel = () => { cancelPending(); previous = null; };
  const click = (id: string, now = performance.now()) => {
    if (previous?.id === id && now - previous.time < doubleClickMs) {
      cancel(); actions.doubleClick?.(id); return;
    }
    cancel(); previous = { id, time: now };
    if (!actions.isSelected(id)) actions.select(id);
    else timer = setTimeout(() => {
      timer = null; previous = null;
      if (actions.isSelected(id)) actions.toggle(id);
    }, doubleClickMs);
  };
  const selectionChanged = (id: string | null) => {
    cancelPending();
    if (previous?.id !== id) previous = null;
  };
  return { click, cancel, cancelPending, selectionChanged };
}
