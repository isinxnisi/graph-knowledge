// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { useState } from "react";
import DiscoveryConnections from "../components/DiscoveryConnections";
import { initialConnectionsWorkspace, type ConnectionsWorkspace } from "../lib/domain/discovery-connections";
import RelationFilter from "../components/RelationFilter";
import { normalizeRelationCondition } from "../lib/domain/relation-conditions";
vi.mock("../lib/client/use-discovery-targets", () => ({ useDiscoveryTargets: () => ({ loading: false, result: null, previous: null, error: null }) }));
beforeAll(() => {
 HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
 HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
it("保存された段別Roleを編集しても共通ORへ縮退せず、起点側を保持する", async () => {
 const relation = normalizeRelationCondition({ version: 1, type: "pattern", pattern: { id: "other-works", revision: 3 }, polarity: "affirmed", contributionRoles: null, stepRoles: [["AUTHORSHIP"], ["DRAWING"]] });
 const apply = vi.fn().mockResolvedValue(true);
 render(<RelationFilter value={["CONTRIBUTED_TO"]} relation={relation} patternAllowed onApply={vi.fn()} onApplyRelation={apply} />);
 fireEvent.click(screen.getByRole("button"));
 const second = screen.getByRole("group", { name: "別作品側" });
 fireEvent.click(within(second).getByLabelText("脚本"));
 fireEvent.click(screen.getByRole("button", { name: "適用" }));
 await waitFor(() => expect(apply).toHaveBeenCalledWith(expect.objectContaining({ pattern: { id: "other-works", revision: 3 }, contributionRoles: null, stepRoles: [["AUTHORSHIP"], ["DRAWING", "SCRIPT_WRITING"]] })));
});

it("対象検索の段別Roleを独立編集し、既存パターンボタンで条件を失わない", () => {
 const changed = vi.fn();
 function Harness() {
  const [value, setValue] = useState<ConnectionsWorkspace>({ ...initialConnectionsWorkspace, step: "targets", criteria: { q: "", kind: "work", nameTarget: "subject", relation: normalizeRelationCondition({ version: 1, type: "pattern", pattern: { id: "other-works", revision: 2 }, polarity: "affirmed", contributionRoles: null }) } });
  return <DiscoveryConnections value={value} body={{ current: null }} onCheckpoint={vi.fn()} onGraph={vi.fn()} onChange={next => { changed(next); setValue(next); }} />;
 }
 render(<Harness />);
 fireEvent.click(screen.getByLabelText("段ごとにRoleを指定（作品を起点）"));
 fireEvent.click(within(screen.getByRole("group", { name: "起点作品側" })).getByRole("button", { name: "著者" }));
 fireEvent.click(within(screen.getByRole("group", { name: "別作品側" })).getByRole("button", { name: "作画" }));
 fireEvent.click(screen.getByRole("button", { name: "同じつくり手の別作品" }));
 expect(changed.mock.calls.at(-1)?.[0].criteria.relation).toMatchObject({ pattern: { revision: 3 }, contributionRoles: null, stepRoles: [["AUTHORSHIP"], ["DRAWING"]] });
 expect(changed.mock.calls.at(-1)?.[0].cache).toBeNull();
});
