import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { memberDraftContent, memberDraftRequired, sameMemberContent, type MemberCapsuleDraft } from "../lib/client/member-capsule-edit";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import { claimDetailSchema } from "../lib/domain/api";

const claim = claimDetailSchema.parse(examples.claim.claim);
function draft(): MemberCapsuleDraft {
  const content = { dataset: "demo" as const, title: "説明付き関係図", note: "自分の説明", language: "ja" as const,
    entityIds: [claim.subjectId, claim.objectId, randomUUID()], claimIds: [claim.id] };
  const base = { id: randomUUID(), schemaVersion: 1 as const, revision: 1, createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z", content };
  return { ownerId: randomUUID(), base, expected: base, content, resolved: { entities: {}, claims: { [claim.id]: claim }, issues: [] }, needsCheck: false };
}
describe("会員Capsuleの編集内容", () => {
  it("主張の両端を保持し、孤立対象だけを明示的に外せる", () => {
    const value = draft(); value.content = { ...value.content, entityIds: [] };
    expect([...memberDraftRequired(value)]).toEqual([claim.subjectId, claim.objectId]);
    expect(memberDraftContent(value).entityIds).toEqual([claim.subjectId, claim.objectId]);
    expect(value.base.content.entityIds).toHaveLength(3);
  });
  it("未解決主張を残す間は元の全対象を保持し、明示除外後に外せる", () => {
    const value = draft(); value.resolved.claims = {}; value.content = { ...value.content, entityIds: [], note: "根拠取得失敗中も説明を修正" };
    expect(memberDraftContent(value).entityIds).toEqual(value.base.content.entityIds);
    expect(memberDraftContent(value).claimIds).toEqual([claim.id]);
    value.content = { ...value.content, claimIds: [], entityIds: [claim.subjectId] };
    expect(memberDraftContent(value).entityIds).toEqual([claim.subjectId]);
  });
  it("空構成・白紙題名・文字上限・未知参照を保存しない", () => {
    for (const patch of [{ title: " " }, { note: "x".repeat(4001) }, { entityIds: [], claimIds: [] }, { entityIds: [randomUUID()] }, { claimIds: [randomUUID()] }]) {
      const value = draft(); value.content = { ...value.content, ...patch };
      expect(() => memberDraftContent(value)).toThrow();
    }
  });
  it("順序・題名前後空白だけでは内容版を作らず、意味の異なる構成を区別する", () => {
    const { content } = draft();
    expect(sameMemberContent(content, { ...content, title: ` ${content.title} `, entityIds: [...content.entityIds].reverse() })).toBe(true);
    expect(sameMemberContent(content, { ...content, note: "新しい説明" })).toBe(false);
    expect(sameMemberContent(content, { ...content, claimIds: [] })).toBe(false);
    expect(sameMemberContent(content, { ...content, dataset: "pilot-science-v1" })).toBe(false);
  });
  it("競合後に期待版を明示更新しても、編集中の参照と説明を暗黙に変えない", () => {
    const value = draft(); const content = memberDraftContent(value);
    value.expected = { ...value.base, revision: 2, content: { ...value.base.content, note: "別端末", claimIds: [], entityIds: [randomUUID()] } };
    expect(memberDraftContent(value)).toEqual(content);
    expect(sameMemberContent(value.expected.content, content)).toBe(false);
  });
});
