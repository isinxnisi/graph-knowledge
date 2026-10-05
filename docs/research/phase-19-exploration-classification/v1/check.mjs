// 研究用の条件解決検証。アプリからimportせず、DB・資料への書込みもしない。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFixture } from "../../../../lib/domain/fixture.ts";
import { explorationKey, matchesClaim } from "../../../../lib/domain/exploration.ts";
import { neighborsInput, ApiError } from "../../../../lib/server/http.ts";
import { encodeNeighborCursor, decodeNeighborCursor } from "../../../../lib/server/neighbor-cursor.ts";

const load = path => validateFixture(JSON.parse(readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8")));
const demo = load("fixtures/demo.json");
const manga = load("datasets/pilot-urasawa/v2/data.json");
const science = load("datasets/pilot-science/v2/data.json");
const event = load("datasets/pilot-event/v1/data.json");
const input = query => neighborsInput(new Request(`http://research.invalid/neighbors?${query}`));
const matches = (claim, c) => matchesClaim(claim, c.predicates, c.contributionRoles ?? null, c.organizationPositions ?? null, c.eventRoles ?? null);
const select = (dataset, c) => dataset.claims.filter(claim => claim.visibility === "published" && matches(claim, c));
const key = c => explorationKey(c.predicates, c.contributionRoles ?? null, c.organizationPositions ?? null, c.eventRoles ?? null);

// 三つの固定仮説だけ。未解決の活動領域・仕事候補を全件条件へ退避しない。
const recipes = {
  "relation.work-production": "CONTRIBUTED_TO",
  "relation.organization-involvement": "AFFILIATED_WITH",
  "relation.event-participation": "PARTICIPATED_IN",
};
function resolve(ids) {
  for (const id of ids) assert.ok(Object.hasOwn(recipes, id), `未解決または非採用の入口: ${id}`);
  return input(`predicates=${ids.map(id => recipes[id]).join(",")}`);
}

let scenarios = 0;
function check(label, run) { run(); scenarios++; console.log(`OK ${label}`); }

check("三つの入口を既存入力へ解決し、肯否・限定ありなしを維持", () => {
  assert.equal(select(demo, resolve(["relation.work-production"])).length, 5);
  assert.equal(select(manga, resolve(["relation.work-production"])).length, 13);
  assert.equal(select(science, resolve(["relation.organization-involvement"])).length, 10);
  assert.equal(select(event, resolve(["relation.event-participation"])).length, 3);
});
check("同軸はOR・順序と重複を正規化・未選択nullと空集合を区別", () => {
  const a = resolve(["relation.organization-involvement", "relation.event-participation"]);
  const b = resolve(["relation.event-participation", "relation.organization-involvement", "relation.event-participation"]);
  assert.equal(select(event, a).length, 13);
  assert.equal(key(a), key(b));
  assert.notEqual(key(input("")), key(resolve([])));
  assert.equal(select(event, resolve([])).length, 0);
});
check("学術・仕事・未知IDを黙って全件／部分条件へ解決しない", () => {
  for (const id of ["activity.academic", "candidate.work", "unknown"]) assert.throws(() => resolve([id]));
  assert.throws(() => resolve(["relation.organization-involvement", "activity.academic"]));
});

const visitor = science.claims.find(c => c.organizationParticipation?.positionId === "VISITOR");
assert.ok(visitor);
const broad = science.claims.find(c => c.subjectId === visitor.subjectId && c.objectId === visitor.objectId && !c.organizationParticipation);
assert.ok(broad);
const visitingProfessor = { predicate: "AFFILIATED_WITH", organizationParticipation: null };
const visitorCondition = input("predicates=AFFILIATED_WITH&organizationPositions=VISITOR");
const lexicalContains = (text, query) => text.toLowerCase().includes(query.toLowerCase());
const evidence = c => science.citations.filter(x => x.claimId === c.id)
  .map(x => [x.note ?? "", x.positionEvidence?.originalText ?? ""].join(" ")).join(" ");

check("Visitor三状態：精密条件は既知値のみ、広い組織入口は限定なしも通す", () => {
  assert.equal(matches(visitor, visitorCondition), true);
  assert.equal(matches(visitingProfessor, visitorCondition), false);
  assert.equal(matches(broad, visitorCondition), false);
  for (const claim of [visitor, visitingProfessor, broad]) assert.equal(matches(claim, resolve(["relation.organization-involvement"])), true);
});
check("原語検索の候補は精密条件より広い：同じ資料の広いClaimにもVisitorがある", () => {
  assert.equal(lexicalContains(evidence(visitor), "Visitor"), true);
  assert.equal(lexicalContains(evidence(broad), "Visitor"), true);
  assert.equal(lexicalContains("Visiting Professor", "Visitor"), false);
  assert.equal(lexicalContains("Visiting Professor", "Visiting Professor"), true);
  assert.equal(lexicalContains("Visitor", "客員"), false);
});
check("全立場指定は無条件ではない・空立場集合は当該Predicateを空にする", () => {
  assert.equal(select(science, visitorCondition).length, 1);
  assert.equal(select(science, input("predicates=AFFILIATED_WITH&organizationPositions=VISITOR,ASSOCIATE_PROFESSOR")).length, 2);
  assert.equal(select(science, input("predicates=AFFILIATED_WITH&organizationPositions=")).length, 0);
  assert.equal(select(science, input("predicates=AFFILIATED_WITH")).length, 10);
});
check("CHAIR精密条件は広い参加を含めず、限定単独なら他Predicateを通す", () => {
  assert.equal(select(event, input("predicates=PARTICIPATED_IN&eventRoles=CHAIR")).length, 1);
  assert.equal(select(event, input("eventRoles=CHAIR")).length, 11);
});
check("PRODUCING精密条件は広い制作を含めず、限定単独なら影響を通す", () => {
  assert.equal(select(manga, input("predicates=CONTRIBUTED_TO&contributionRoles=PRODUCING")).length, 1);
  assert.equal(select(manga, input("contributionRoles=PRODUCING")).length, 2);
});
check("精密条件も肯否を選別しない：人工denied対照はメモリ内だけ", () => {
  assert.equal(matches({ ...visitor, polarity: "denied" }, visitorCondition), true);
  assert.equal(select(demo, input("predicates=ASSISTANT_OF")).some(c => c.polarity === "denied"), true);
});
check("未対応語・facet・polarityは公開neighbors入力で拒否される", () => {
  for (const q of ["organizationPositions=VISITING_PROFESSOR", "facet=academic", "polarity=affirmed", "q=Visitor"]) {
    assert.throws(() => input(q), error => error instanceof ApiError && error.status === 400);
  }
});
check("cursorは入口名でなく解決後の条件へ拘束、精密条件への変更は拒否", () => {
  const center = visitor.subjectId, after = visitor.id;
  const base = resolve(["relation.organization-involvement"]);
  const cursor = encodeNeighborCursor(center, base.predicates, after, null, "pilot-science-v2");
  assert.equal(decodeNeighborCursor(cursor, center, base.predicates, null, "pilot-science-v2"), after);
  assert.throws(() => decodeNeighborCursor(cursor, center, visitorCondition.predicates, null, "pilot-science-v2", visitorCondition.organizationPositions));
});
check("条件はLIMIT前：これはメモリ上の順序対照であり実DB検証ではない", () => {
  const ordered = [broad, visitor];
  assert.deepEqual(ordered.filter(c => matches(c, visitorCondition)).slice(0, 1).map(c => c.id), [visitor.id]);
  assert.equal(ordered.slice(0, 1).filter(c => matches(c, visitorCondition)).length, 0);
});
console.log(`${scenarios} scenarios passed; no DB, runtime API, UI or dataset writes`);
