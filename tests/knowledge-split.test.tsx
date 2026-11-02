// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import KnowledgeSplit from "../components/KnowledgeSplit";
afterEach(cleanup);
it("keeps both views mounted while resizing and changing presentation", () => {
  const children = [<input key="left" aria-label="left" defaultValue="draft" />, <div key="right">graph</div>];
  const view = render(<KnowledgeSplit mode="split">{children}</KnowledgeSplit>);
  const divider = screen.getByRole("separator");
  fireEvent.keyDown(divider, { key: "End" });
  expect(divider.getAttribute("aria-valuenow")).toBe("70");
  fireEvent.keyDown(divider, { key: "ArrowRight" });
  expect(divider.getAttribute("aria-valuenow")).toBe("70");
  fireEvent.keyDown(divider, { key: "Home" });
  expect(divider.getAttribute("aria-valuenow")).toBe("30");
  fireEvent.doubleClick(divider);
  expect(divider.getAttribute("aria-valuenow")).toBe("50");
  const input = screen.getByLabelText("left");
  fireEvent.change(input, { target: { value: "kept" } });
  view.rerender(<KnowledgeSplit mode="timeline">{children}</KnowledgeSplit>);
  expect(screen.getByLabelText("left")).toBe(input);
  expect((input as HTMLInputElement).value).toBe("kept");
  expect(divider.tabIndex).toBe(-1);
});
