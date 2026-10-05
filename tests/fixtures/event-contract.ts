import { validateFixture } from "../../lib/domain/fixture";
// 全て架空。Source確認／人間受入待ちのE01/E03を実DBに代入しない。
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const EVENT_TEST_IDS = { person: id(1), other: id(2), event: id(3), work: id(4), organization: id(5), broad: id(11), chair: id(12), deniedChair: id(13), otherBroad: id(14), creation: id(15), affiliation: id(16) };
export function eventContractFixture() {
  const t = "2026-10-05T00:00:00Z", stamp = { createdAt: t, updatedAt: t };
  const entities = [
    { id: id(1), kind: "person", name: "架空参加者A" }, { id: id(2), kind: "person", name: "架空参加者B" },
    { id: id(3), kind: "event", name: "架空会議 第1回" }, { id: id(4), kind: "work", name: "架空作品" }, { id: id(5), kind: "organization", name: "架空組織" },
  ].map(e => ({ ...e, description: "契約検証用の人工データ。実在資料の受入ではありません。", aliases: [e.name], externalIds: [], event: e.kind === "event" ? { granularity: "occurrence", period: { from: { value: "2020-01-01", precision: "day" }, to: { value: "2020-01-03", precision: "day" } } } : null, ...stamp }));
  const claims = [
    { id: id(11), subjectId: id(1), objectId: id(3), predicate: "PARTICIPATED_IN" },
    { id: id(12), subjectId: id(1), objectId: id(3), predicate: "PARTICIPATED_IN", eventParticipation: { roleId: "CHAIR" } },
    { id: id(13), subjectId: id(1), objectId: id(3), predicate: "PARTICIPATED_IN", eventParticipation: { roleId: "CHAIR" }, polarity: "denied" },
    { id: id(14), subjectId: id(2), objectId: id(3), predicate: "PARTICIPATED_IN" },
    { id: id(15), subjectId: id(1), objectId: id(4), predicate: "CONTRIBUTED_TO", contribution: { roleId: "SUPERVISION", scope: null } },
    { id: id(16), subjectId: id(1), objectId: id(5), predicate: "AFFILIATED_WITH", organizationParticipation: { positionId: "VISITOR" } },
  ].map(c => ({ polarity: "affirmed", contribution: null, organizationParticipation: null, eventParticipation: null, ...c, period: { from: null, to: null }, visibility: "published", ...stamp }));
  return validateFixture({ schemaVersion: 4, entities, claims,
    sources: [{ id: id(21), kind: "web", title: "架空の契約テスト資料", authors: [], publisher: null, url: "https://example.invalid/event-test", publishedAt: null, edition: null, note: "実在の否定資料ではない", isDemo: true }],
    citations: [31,32].map((n, i) => ({ id: id(n), claimId: id(12), sourceId: id(21), locator: `架空参照 ${i+1}`, note: "会議議長として参加したという人工の契約テスト。全日程の出席を意味しない。", accessedAt: null, stance: "support", roleEvidence: null, positionEvidence: null, eventParticipationEvidence: { originalText: "Chair", language: "en" } })),
  });
}
