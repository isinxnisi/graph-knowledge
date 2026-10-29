// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachGraphTouchInput, createNodeClickHandler, createRelationClickHandler } from "../lib/client/graph-interaction";

const finger = (identifier = 1, clientX = 100, clientY = 100) => ({ identifier, clientX, clientY }) as Touch;
function dispatch(surface: HTMLElement, type: string, timeStamp: number, touches: Touch[], changedTouches = touches) {
  const event = new TouchEvent(type, { bubbles: true, touches, changedTouches });
  Object.defineProperty(event, "timeStamp", { value: timeStamp }); surface.dispatchEvent(event); return event;
}
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });
function fixture() {
  const surface = document.body.appendChild(document.createElement("div")), select = vi.fn(), open = vi.fn();
  const clicks = createRelationClickHandler(select, open), input = attachGraphTouchInput(surface, clicks.cancel);
  const finish = (time: number, id = "node", touch = finger()) => {
    const event = dispatch(surface, "touchend", time, [], [touch]);
    if (input.accept(event)) clicks.click(id, event.timeStamp, "touch");
  };
  const tap = (time: number, id = "node") => { dispatch(surface, "touchstart", time, [finger()]); finish(time + 35, id); };
  return { surface, select, open, input, finish, tap };
}
describe("completed native touch gestures", () => {
  it("accepts two short taps with finger jitter at a touch-appropriate interval, exactly once", () => {
    const f = fixture(); f.tap(100);
    dispatch(f.surface, "touchstart", 450, [finger()]);
    dispatch(f.surface, "touchmove", 465, [finger(1, 104, 102)]); f.finish(485, "node", finger(1, 104, 102));
    expect(f.select).toHaveBeenCalledExactlyOnceWith("node"); expect(f.open).toHaveBeenCalledExactlyOnceWith("node");
    f.tap(550); expect(f.open).toHaveBeenCalledTimes(1); f.input.dispose();
  });
  it.each(["touchcancel", "multitouch", "drag", "longpress", "release-away"])("does not join taps across %s", interruption => {
    const f = fixture(); f.tap(100); dispatch(f.surface, "touchstart", 180, [finger()]);
    if (interruption === "touchcancel") dispatch(f.surface, "touchcancel", 190, [], [finger()]);
    if (interruption === "multitouch") {
      // A stationary second finger produces no pan or zoom event.
      dispatch(f.surface, "touchstart", 190, [finger(), finger(2, 150)]);
      dispatch(f.surface, "touchend", 200, [finger()], [finger(2, 150)]);
    }
    if (interruption === "drag") {
      dispatch(f.surface, "touchmove", 190, [finger(1, 120)]);
      dispatch(f.surface, "touchmove", 200, [finger()]);
    }
    f.finish(interruption === "longpress" ? 700 : 220, "node", interruption === "release-away" ? finger(1, 110) : finger());
    f.tap(interruption === "longpress" ? 750 : 260); expect(f.open).not.toHaveBeenCalled();
    f.tap(interruption === "longpress" ? 850 : 360); expect(f.open).toHaveBeenCalledExactlyOnceWith("node"); f.input.dispose();
  });
  it("never treats mixed mouse/touch input or different targets as a double tap", () => {
    const select = vi.fn(), open = vi.fn(), clicks = createRelationClickHandler(select, open);
    clicks.click("a", 100, "mouse"); clicks.click("a", 150, "touch"); clicks.click("b", 200, "touch");
    expect(open).not.toHaveBeenCalled(); clicks.click("b", 250, "touch"); expect(open).toHaveBeenCalledExactlyOnceWith("b");
  });
  it("drops the completed first tap and pending ordinary expansion when the window loses focus", () => {
    const f = fixture(); f.tap(100); window.dispatchEvent(new Event("blur")); f.tap(200);
    expect(f.open).not.toHaveBeenCalled(); f.input.dispose();
    vi.useFakeTimers(); const toggle = vi.fn();
    const clicks = createNodeClickHandler({ isSelected: () => true, select: vi.fn(), toggle });
    const input = attachGraphTouchInput(f.surface, clicks.cancel);
    clicks.click("node", 300, "touch"); window.dispatchEvent(new Event("blur")); vi.advanceTimersByTime(500);
    expect(toggle).not.toHaveBeenCalled(); input.dispose();
  });
  it("keeps ordinary Graph selection immediate and a selected node's expansion delayed; double tap opens details", () => {
    vi.useFakeTimers(); let selected: string | null = null;
    const select = vi.fn((id: string) => { selected = id; }), toggle = vi.fn(), open = vi.fn();
    const handler = createNodeClickHandler({ isSelected: id => selected === id, select, toggle, doubleClick: open });
    handler.click("a", 100, "touch"); expect(select).toHaveBeenCalledExactlyOnceWith("a");
    handler.click("a", 450, "touch"); expect(open).toHaveBeenCalledExactlyOnceWith("a"); expect(toggle).not.toHaveBeenCalled();
    handler.click("a", 900, "touch"); vi.advanceTimersByTime(399); expect(toggle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(toggle).toHaveBeenCalledExactlyOnceWith("a"); handler.cancel();
  });
});
