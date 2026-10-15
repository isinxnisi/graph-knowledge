// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import FocusModality from "../components/FocusModality";
import GraphNotice, { GRAPH_NOTICE_DURATION } from "../components/GraphNotice";
import { graphNoticePresentation } from "../lib/client/graph-notice";
import { focusDestination } from "../lib/client/focus-destination";
import { workspaceLabels } from "../lib/i18n/workspace";
import { overviewLabels } from "../lib/i18n/entity-overview";
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("入力と意味を保つフォーカス", () => {
  it("タッチ→Tab→補助技術のclickを区別し、移動先と操作要素の意味を維持する", () => {
    render(<><FocusModality /><section data-testid="destination" aria-label="Graph" role="group" tabIndex={-1} /><button>Zoom</button></>);
    expect(document.documentElement.dataset.inputModality).toBe("initial");
    fireEvent.pointerDown(screen.getByRole("button"));
    expect(document.documentElement.dataset.inputModality).toBe("pointer");
    const target = screen.getByTestId("destination"); focusDestination(target);
    expect(document.activeElement).toBe(target); expect(target.dataset.focusDestination).toBe("true");
    expect(target.getAttribute("role")).toBe("group"); expect(target.tabIndex).toBe(-1);
    fireEvent.keyDown(document, { key: "Tab" }); expect(document.documentElement.dataset.inputModality).toBe("keyboard");
    fireEvent.pointerDown(target); fireEvent.click(screen.getByRole("button"), { detail: 0 });
    expect(document.documentElement.dataset.inputModality).toBe("keyboard");
    focusDestination(screen.getByRole("button")); expect(screen.getByRole("button").hasAttribute("data-focus-destination")).toBe(false);
  });
});
describe("成功通知と重要な警告", () => {
  it("JA/ENの欠落なし復元だけを短い成功とし、欠落・不明・保存上限は残す", () => {
    for (const locale of ["ja", "en"]) {
      expect(graphNoticePresentation(workspaceLabels(locale).restored(0), locale)).toMatchObject({ kind: "info", text: locale === "ja" ? "探索を復元しました。" : "Exploration restored." });
      for (const message of [workspaceLabels(locale).restored(2), overviewLabels(locale).notSaved, "Unknown failure"]) expect(graphNoticePresentation(message, locale)?.kind).toBe("warning");
    }
  });
  it("成功は短時間で消え、読み直しや言語更新で無期限に延長しない", () => {
    vi.useFakeTimers(); const notice = graphNoticePresentation(workspaceLabels().restored(0))!;
    const { rerender } = render(<GraphNotice notice={notice} />);
    expect(screen.getByRole("status").textContent).toBe("探索を復元しました。");
    act(() => vi.advanceTimersByTime(2000)); rerender(<GraphNotice notice={{ ...notice }} />);
    act(() => vi.advanceTimersByTime(GRAPH_NOTICE_DURATION - 2000)); expect(screen.queryByRole("status")).toBeNull();
  });
  it("欠落警告は消えず、既に成功通知が終了していても警告を表示する", () => {
    vi.useFakeTimers(); const { rerender } = render(<GraphNotice notice={graphNoticePresentation(workspaceLabels().restored(0))!} />);
    act(() => vi.advanceTimersByTime(GRAPH_NOTICE_DURATION));
    rerender(<GraphNotice notice={graphNoticePresentation(workspaceLabels().restored(2))!} />);
    act(() => vi.advanceTimersByTime(60000)); expect(screen.getByRole("alert").textContent).toContain("2件は再開していません");
  });
});
