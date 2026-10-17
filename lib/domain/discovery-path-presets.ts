import { z } from "zod";
import type { ClaimSummary, EntitySummary } from "./api";

// A small versioned catalogue of executable route shapes; no world-to-DB mapping.
export const PATH_PRESET_IDS = ["other-works", "work-creators", "co-creators", "institution-bridge"] as const;
export const pathPresetRefSchema = z.strictObject({ id: z.enum(PATH_PRESET_IDS), revision: z.literal(1) });
export type PathPresetRef = z.infer<typeof pathPresetRefSchema>;
type Kind = EntitySummary["kind"];
type Text = readonly [string, string];
type PathPreset = {
  id: PathPresetRef["id"]; revision: 1; depth: 2 | 3;
  predicate: "CONTRIBUTED_TO" | "AFFILIATED_WITH";
  kinds: readonly Kind[]; title: Text; purpose: Text; shape: Text;
};
export const pathPresets: readonly PathPreset[] = [
  { id: "other-works", revision: 1, depth: 2, predicate: "CONTRIBUTED_TO", kinds: ["work", "person", "work"],
    title: ["同じつくり手の別作品", "Other works, same contributor"],
    purpose: ["同じ人物の制作記録を介して、別作品へ。著者だけには限定しません。", "Follow one person's production records to other works. Contributors are not limited to authors."],
    shape: ["作品 — 人物 — 別作品", "Work — person — another work"] },
  { id: "work-creators", revision: 1, depth: 3, predicate: "CONTRIBUTED_TO", kinds: ["work", "person", "work", "person"],
    title: ["別作品のつくり手へ", "Meet another work’s contributors"],
    purpose: ["つくり手の別作品を辿り、さらに別の制作担当へ。", "Follow a contributor to another work, then meet a different contributor."],
    shape: ["作品 — 人物 — 別作品 — 別の人物", "Work — person — another work — another person"] },
  { id: "co-creators", revision: 1, depth: 2, predicate: "CONTRIBUTED_TO", kinds: ["person", "work", "person"],
    title: ["作品を介して別のつくり手へ", "Meet contributors through a work"],
    purpose: ["同じ作品に接続する制作記録から、別の人物へ。同時期の参加や共作とは限りません。", "Find another person through production records for one work. Participation need not be simultaneous or collaborative."],
    shape: ["人物 — 作品 — 別の人物", "Person — work — another person"] },
  { id: "institution-bridge", revision: 1, depth: 2, predicate: "AFFILIATED_WITH", kinds: ["organization", "person", "organization"],
    title: ["人を介して別の機関へ", "Follow people to other institutions"],
    purpose: ["一人の所属記録を介して、別の組織へ。移動の順序や現在の所属は、経路だけでは判断しません。", "Follow a person's affiliation records to another organization. The route does not establish a move's chronology or a current affiliation."],
    shape: ["組織 — 人物 — 別の組織", "Organization — person — another organization"] },
];
export function resolvePathPreset(ref: PathPresetRef) {
  pathPresetRefSchema.parse(ref);
  return pathPresets.find(p => p.id === ref.id)!;
}
export function presetAcceptsStep(ref: PathPresetRef, claim: ClaimSummary, from: EntitySummary, to: EntitySummary, step: number) {
  const preset = resolvePathPreset(ref);
  if (from.kind !== preset.kinds[step] || to.kind !== preset.kinds[step + 1] || claim.predicate !== preset.predicate) return false;
  // Production and affiliation are canonical person -> work/organization, in either traversal direction.
  return from.kind === "person" ? claim.subjectId === from.id && claim.objectId === to.id
    : claim.subjectId === to.id && claim.objectId === from.id;
}
