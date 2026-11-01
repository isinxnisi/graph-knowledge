// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import TemporalPatternLab from "../components/TemporalPatternLab";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockClear();
});
it("does not draw a replacement date for an unsupported clock value", () => {
  render(<TemporalPatternLab caseId="hour" />);
  expect(
    screen.getByText("この表現の描画には、時間モデルの拡張が必要です"),
  ).toBeTruthy();
  expect(
    document.querySelector('[aria-label="期間と出来事の年表グラフ"]'),
  ).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "選んだ記録をテーマに保存",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (screen.getByLabelText("仮想ケースの原本JSON") as HTMLTextAreaElement)
      .value,
  ).toContain("2030-05-08T09+09:00");
});
it("shows a semantic gap even when the current validator can store the label", () => {
  render(<TemporalPatternLab caseId="first-half-label" />);
  expect(
    screen.getByText(
      /^現行の不足：文字として保存できても、計算上は年全体のまま/,
    ),
  ).toBeTruthy();
  expect(
    document.querySelector('[aria-label="期間と出来事の年表グラフ"]'),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "選んだ記録をテーマに保存",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("saves the selected synthetic records through the normal import API without overwriting a fixture theme", async () => {
  let body:
    | {
        package: { id: string; records: { id: string }[]; title: string };
        requestId: string;
      }
    | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: body!.package.id }),
      });
    }),
  );
  render(<TemporalPatternLab caseId="pair-before" />);
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "テーマに保存する：【仮想】架空の活動B",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "選んだ記録をテーマに保存" }),
  );
  await waitFor(() => expect(push).toHaveBeenCalled());
  expect(body!.package.records.map((r) => r.id)).toEqual(["a"]);
  expect(body!.package.id).toMatch(/^pattern-pair-before-[a-f0-9]{8}$/);
  expect(body!.package.title).toContain("【仮想】");
});

it("promotes a selected child axis instead of saving a dangling parent reference", async () => {
  let body:
    | {
        package: {
          records: { id: string }[];
          timeline: { insets: unknown[]; axes: { id: string }[] };
        };
      }
    | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: "saved-child" }),
      });
    }),
  );
  render(<TemporalPatternLab caseId="explicit-inset" />);
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "テーマに保存する：【仮想】架空の一日A",
    }),
  );
  // Open the parent only for reading; it remains unselected.
  fireEvent.click(screen.getByRole("button", { name: /^【仮想】架空の一日A/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "選んだ記録をテーマに保存" }),
  );
  await waitFor(() => expect(body).toBeDefined());
  expect(body!.package.records.map((r) => r.id)).toEqual(["b"]);
  expect(body!.package.timeline.insets).toEqual([]);
  expect(body!.package.timeline.axes.map((a) => a.id)).toEqual(["day"]);
});
