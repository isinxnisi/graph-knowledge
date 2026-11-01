// @vitest-environment jsdom
import React from "react";
import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ThemeEvidenceFields from "../components/ThemeEvidenceFields";
afterEach(cleanup);
const source = {
  url: "https://example.org/source",
  title: "資料",
  locator: "1頁",
  excerpt: "確認内容",
  retrievedAt: "2026-11-01T00:00:00Z",
};
it("requires one source and caps the draft at twenty without losing removed evidence", () => {
  const initial = render(
    <form>
      <ThemeEvidenceFields
        evidence={[source]}
        records={[]}
        enteredAt={source.retrievedAt}
        busy={false}
      />
    </form>,
  );
  expect(
    (screen.getByRole("button", { name: "根拠 1 を外す" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  initial.unmount();
  render(
    <form>
      <ThemeEvidenceFields
        evidence={Array.from({ length: 19 }, (_, i) => ({
          ...source,
          title: `資料${i + 1}`,
        }))}
        records={[]}
        enteredAt={source.retrievedAt}
        busy={false}
      />
    </form>,
  );
  fireEvent.click(screen.getByRole("button", { name: "＋ 根拠を追加" }));
  expect(
    (screen.getByRole("button", { name: "＋ 根拠を追加" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "根拠 1 を外す" }));
  fireEvent.click(screen.getByRole("button", { name: "外した根拠を戻す" }));
  expect(
    (screen.getAllByLabelText("根拠の箇所")[0] as HTMLInputElement).value,
  ).toBe("1頁");
  expect(screen.getAllByLabelText("根拠URL")).toHaveLength(20);
});
it("keeps a new source open while its title is typed", () => {
  render(
    <form>
      <ThemeEvidenceFields
        records={[]}
        enteredAt={source.retrievedAt}
        busy={false}
      />
    </form>,
  );
  const field = screen.getByLabelText("資料名");
  fireEvent.change(field, { target: { value: "入力途中" } });
  expect(field.closest("details")!.open).toBe(true);
});

it("distinguishes same-title sources on one host by their complete URLs", () => {
  render(<ThemeEvidenceFields enteredAt={source.retrievedAt} busy={false} records={[{id:"r",kind:"relation",subject:"a",object:"b",assertion:"test",relation:"test",scope:"",polarity:"affirmed",time:null,revision:1,mapping:null,reason:"test",updatedAt:source.retrievedAt,evidence:[source,{...source,url:"https://example.org/other"}]}]} />);
  expect(screen.getByRole("option",{name:"資料 — https://example.org/source"})).toBeTruthy();
  expect(screen.getByRole("option",{name:"資料 — https://example.org/other"})).toBeTruthy();
});
