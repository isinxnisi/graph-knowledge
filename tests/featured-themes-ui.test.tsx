// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { FeaturedThemesOperations } from "../components/FeaturedThemesOperations";
import { MemberClientError } from "../lib/client/member-api";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/client/member-api", async original => ({ ...await original(), memberRequest: mocks.request }));
const themes = ["展開の年表", "制作のつながり", "テーマの背景"].map((title, i) => ({ id: `theme:${i}`, revision: 1, title, description: "説明", hasTimeline: i === 0, hasRelations: i !== 2, initialView: i === 0 ? "timeline" : "graph", entityIds: [] }));
const initial = { revision: 1, themeIds: ["theme:0"], updatedAt: null, themes };
const userId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { mocks.request.mockReset().mockImplementation(async (_path: string, schema: z.ZodType, options: { method?: string; body?: { themeIds: string[] } }) => schema.parse(options?.method === "POST" ? { revision: 2, themeIds: options.body!.themeIds, updatedAt: null, replayed: false } : initial)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("keeps selection across filters, supports order and removal, and saves only explicitly", async () => {
  render(<FeaturedThemesOperations userId={userId} authorized/>);
  fireEvent.click(await screen.findByRole("button", { name: "制作のつながりを掲載に追加" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "背景" } });
  fireEvent.click(screen.getByRole("button", { name: "テーマの背景を掲載に追加" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "timeline" } });
  expect(screen.getByRole("list", { name: "掲載順" }).children).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "テーマの背景を上へ" }));
  fireEvent.click(screen.getByRole("button", { name: "展開の年表を掲載から外す" }));
  expect(mocks.request.mock.calls.filter(c => c[2]?.method === "POST")).toHaveLength(0);
  fireEvent.click(screen.getByText("TOPでの見え方"));
  const preview = screen.getByRole("list", { name: /紹介テーマ/ });
  expect(within(preview).getAllByRole("link").map(a => a.getAttribute("target"))).toEqual(["_blank", "_blank"]);
  fireEvent.click(screen.getByRole("button", { name: "掲載を保存" }));
  await screen.findByText(/保存しました。TOP/);
  expect(mocks.request.mock.calls.find(c => c[2]?.method === "POST")![2].body).toMatchObject({ expectedRevision: 1, themeIds: ["theme:2", "theme:1"] });
});
it("does not replace draft selection on an authorization refresh", async () => {
  const view = render(<FeaturedThemesOperations userId={userId} authorized/>);
  fireEvent.click(await screen.findByRole("button", { name: "制作のつながりを掲載に追加" }));
  view.rerender(<FeaturedThemesOperations userId={userId} authorized={false}/>);
  view.rerender(<FeaturedThemesOperations userId={userId} authorized/>);
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "制作のつながりを掲載から外す" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "変更を破棄" }));
  expect(screen.queryByRole("button", { name: "制作のつながりを掲載から外す" })).toBeNull();
});
it("retries an ambiguous save with the same request and retains conflicting edits", async () => {
  let n = 0; mocks.request.mockImplementation(async (_path: string, schema: z.ZodType, options: { method?: string; body?: unknown }) => {
    if (options?.method !== "POST") return initial;
    if (++n === 1) throw Error("lost reply");
    throw new MemberClientError(409, "FEATURED_THEMES_CHANGED");
  });
  render(<FeaturedThemesOperations userId={userId} authorized/>);
  fireEvent.click(await screen.findByRole("button", { name: "制作のつながりを掲載に追加" }));
  fireEvent.click(screen.getByRole("button", { name: "掲載を保存" }));
  fireEvent.click(await screen.findByRole("button", { name: "保存結果を再確認" }));
  await screen.findByText(/掲載設定またはテーマの公開状態が変わりました/);
  const posts = mocks.request.mock.calls.filter(c => c[2]?.method === "POST"); expect(posts[0][2].body).toEqual(posts[1][2].body);
  expect(screen.getByRole("button", { name: "制作のつながりを掲載から外す" })).toBeTruthy();
});
