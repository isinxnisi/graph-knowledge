import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  themePackageSchema,
  themeTimeSchema,
  themeRecordSearchText,
  themeDiff,
  type ThemeDetail,
} from "../lib/domain/theme-workbench";
import { themeDocument, documentKey } from "../lib/server/theme-workbench";
const example = JSON.parse(
  readFileSync(
    new URL("../public/theme-examples/ada.json", import.meta.url),
    "utf8",
  ),
);
function theme(): ThemeDetail {
  const p = themePackageSchema.parse(example);
  return {
    ...p,
    revision: 1,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    sourceHash: "test",
    records: p.records.map((r) => ({
      ...r,
      revision: 1,
      reason: "initial",
      updatedAt: "2026-11-01T00:00:00Z",
      mapping: null,
    })),
  };
}
describe("theme input and read model", () => {
  it("accepts both real themes without enum or code registration", () => {
    for (const file of ["ada", "webb"])
      expect(
        themePackageSchema.safeParse(
          JSON.parse(
            readFileSync(
              new URL(
                "../public/theme-examples/" + file + ".json",
                import.meta.url,
              ),
              "utf8",
            ),
          ),
        ).success,
      ).toBe(true);
  });
  it("keeps unknown concrete meanings searchable but does not invent a mapping", () => {
    const t = theme();
    const r = t.records.find((r) => r.id === "annotated")!;
    expect(r.mapping).toBeNull();
    expect(themeRecordSearchText(r, t.entities)).toContain("注釈を加えた");
    expect(themeRecordSearchText(r, t.entities)).toContain("ada lovelace");
  });
  it("rejects missing references and duplicate record ids", () => {
    const p = structuredClone(example);
    p.records[0].subject = "missing";
    expect(themePackageSchema.safeParse(p).success).toBe(false);
    p.records[0].subject = "menabrea";
    p.records.push(p.records[0]);
    expect(themePackageSchema.safeParse(p).success).toBe(false);
  });
  it("rejects nonexistent and reversed calendar dates", () => {
    for (const t of [
      { from: "2026-02-30" },
      { from: "2026-13" },
      { from: "2026-10", to: "2026-02" },
    ])
      expect(
        themeTimeSchema.safeParse({ kind: "calendar", ...t }).success,
      ).toBe(false);
    expect(
      themeTimeSchema.safeParse({ kind: "calendar", from: "2024-02-29" })
        .success,
    ).toBe(true);
  });
  it("supports wrapped cycles and qualitative axes without fake calendar dates", () => {
    expect(
      themeTimeSchema.safeParse({
        kind: "cycle",
        axis: "季節",
        period: 12,
        from: 9,
        to: 1,
        wrap: true,
        unit: "月（0起点）",
        label: "10月から2月",
      }).success,
    ).toBe(true);
    expect(
      themeTimeSchema.safeParse({
        kind: "qualitative",
        axis: "発達",
        from: "幼少期",
        coordinateMeaning: "本人の人生段階",
        label: "幼いころ",
      }).success,
    ).toBe(true);
    expect(
      themeTimeSchema.safeParse({
        kind: "cycle",
        axis: "季節",
        period: 12,
        from: 12,
        to: 1,
        wrap: true,
        unit: "月",
        label: "範囲外",
      }).success,
    ).toBe(false);
  });
  it("keeps record identity and distinguishes content versus mapping changes", () => {
    const t = theme(),
      snapshot = {
        themeId: t.id,
        themeRevision: 1,
        entities: t.entities,
        records: structuredClone(t.records),
      };
    t.records[0].mapping = {
      revision: 1,
      recordRevision: 1,
      concept: { id: "authorship", label: "著述", definition: "文書を著す" },
      reason: "確認",
      updatedAt: t.updatedAt,
    };
    expect(themeDiff(snapshot, t)[0].kind).toBe("meaning");
    t.records[0].revision++;
    expect(themeDiff(snapshot, t)[0].kind).toBe("content");
    expect(snapshot.records[0].revision).toBe(1);
  });
  it("projects concrete relation labels and evidence into a valid Capsule without touching KG identities", () => {
    const t = theme(),
      d = themeDocument({
        themeId: t.id,
        themeRevision: 1,
        entities: t.entities,
        records: t.records,
      });
    expect(d.relations.map((r) => r.label)).toContain("英訳した");
    expect(d.evidence).toHaveLength(4);
    expect(
      d.nodes.find((n) => n.title === "Ada Lovelace")?.description,
    ).not.toContain("作曲");
    expect(d.nodes.every((n) => n.origin.kind === "local")).toBe(true);
    expect(d.texts).toEqual([]);
    expect(documentKey(t.id, "entity:ada")).not.toBe(
      documentKey("different", "entity:ada"),
    );
  });
});
