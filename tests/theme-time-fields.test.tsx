// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThemeTimeFields from "../components/ThemeTimeFields";

afterEach(cleanup);

it("keeps entered dates while comparing the two range meanings and excludes hidden boundary fields", () => {
  const { container } = render(
    <form>
      <ThemeTimeFields time={null} />
    </form>,
  );
  fireEvent.change(screen.getByLabelText("時期の表し方"), {
    target: { value: "duration" },
  });
  fireEvent.change(screen.getByLabelText("開始", { exact: true }), {
    target: { value: "1901" },
  });
  fireEvent.change(screen.getByLabelText("終了", { exact: true }), {
    target: { value: "1904" },
  });
  fireEvent.click(screen.getByLabelText("開始時期に幅がある"));
  fireEvent.change(screen.getByLabelText("開始の最も遅い時期"), {
    target: { value: "1902" },
  });
  fireEvent.change(screen.getByLabelText("時期の表し方"), {
    target: { value: "occurrence-window" },
  });
  expect(new FormData(container.querySelector("form")!).get("from")).toBe(
    "1901",
  );
  expect(new FormData(container.querySelector("form")!).get("to")).toBe("1904");
  expect(
    new FormData(container.querySelector("form")!).has("startLatest"),
  ).toBe(false);
  fireEvent.change(screen.getByLabelText("時期の表し方"), {
    target: { value: "duration" },
  });
  expect(
    (screen.getByLabelText("開始の最も遅い時期") as HTMLInputElement).value,
  ).toBe("1902");
});

it("does not silently reinterpret a legacy date range as a duration", () => {
  render(
    <ThemeTimeFields
      time={{ kind: "calendar", from: "1901", to: "1904", label: "原表現" }}
    />,
  );
  expect(
    (screen.getByLabelText("時期の表し方") as HTMLSelectElement).value,
  ).toBe("unclassified-range");
  expect(screen.getByText(/まだ指定されていません/)).toBeTruthy();
});
