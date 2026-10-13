// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import EntityOverview from "../components/EntityOverview";
import { overviewPresentation, type OverviewRelation } from "../lib/client/overview-presentation";
import { fetchOverview, ClientApiError } from "../lib/client/api";
import type { EntityOverviewResponse } from "../lib/domain/api";

vi.mock("../lib/client/api", async importOriginal => ({ ...await importOriginal<typeof import("../lib/client/api")>(), fetchOverview: vi.fn() }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const counts = (affirmed: number, denied = 0) => ({ affirmed, denied });
const relation = (change: Partial<OverviewRelation> = {}): OverviewRelation => ({ predicate: "PARTICIPATED_IN", perspective: "object", counts: counts(3), contributionRoles: [], organizationPositions: [], eventRoles: [], ...change });
const entity = { id: "247d3efb-6172-4a3e-aa09-dad69914b47c", kind: "event" as const, name: "第5回ソルヴェイ物理会議（1927）", description: "特定開催回" };
const response = (relations: OverviewRelation[]): EntityOverviewResponse => ({ entity, scope: { dataset: "pilot-event-v1", visibility: "published", filtered: false, unit: "claim" }, relations });

describe("関係概要のpresentation境界", () => {
  it("影響の視点別表現と保存方向を分け、端点の種類を示す", () => {
    expect(overviewPresentation(relation({ predicate: "INFLUENCED_BY", perspective: "subject" }))).toMatchObject({ title: "影響を受けた", start: "この人物", verb: "影響を受けた", end: "人物", fromCenter: true });
    expect(overviewPresentation(relation({ predicate: "INFLUENCED_BY", perspective: "object" }))).toMatchObject({ title: "影響を与えた", start: "人物", verb: "影響を受けた", end: "この人物", fromCenter: false });
  });
  it("異なる限定の肯否混在を対立・成立認定にせず、否定だけの限定を明示する", () => {
    const value = relation({ counts: counts(2, 1), eventRoles: [{ roleId: null, counts: counts(2) }, { roleId: "CHAIR", counts: counts(0, 1) }] });
    const original = structuredClone(value);
    expect(overviewPresentation(value)).toMatchObject({ status: "mixed", qualificationSummary: "会議議長（否定のみ）" });
    expect(overviewPresentation(relation({ counts: counts(0, 1) })).status).toBe("denied");
    expect(value).toEqual(original);
  });
  it("未指定を共通Roleにせず、三domainの語彙と限定なしを保持する", () => {
    const creation = overviewPresentation(relation({ predicate: "CONTRIBUTED_TO", contributionRoles: [{ roleId: null, counts: counts(2) }, { roleId: "PRODUCING", counts: counts(1) }] }));
    const organization = overviewPresentation(relation({ predicate: "AFFILIATED_WITH", organizationPositions: [{ positionId: null, counts: counts(4) }, { positionId: "VISITOR", counts: counts(1) }, { positionId: "ASSOCIATE_PROFESSOR", counts: counts(1) }] }));
    const event = overviewPresentation(relation({ eventRoles: [{ roleId: null, counts: counts(2) }, { roleId: "CHAIR", counts: counts(1) }] }));
    expect(creation.qualification?.title).toBe("制作役割の記録");
    expect(organization.qualification?.title).toBe("組織立場の記録");
    expect(event.qualification?.title).toBe("参加立場の記録");
    expect(creation.qualificationSummary).toBe("プロデュース");
    expect(organization.qualificationSummary).toContain("Visitor");
    expect(event.qualification?.entries).toHaveLength(2);
    expect(event.qualification?.entries[0].label).toBe("参加上の立場を限定していない主張");
  });
});

describe("関係概要モーダル", () => {
  it("初期表示は関係と向き・限定の記録、Claim統計は閉じた内訳に置く", async () => {
    vi.mocked(fetchOverview).mockResolvedValue(response([relation({ eventRoles: [{ roleId: null, counts: counts(2) }, { roleId: "CHAIR", counts: counts(1) }] })]));
    const onClose = vi.fn(), onSwitch = vi.fn();
    render(<EntityOverview entity={entity} dataset="pilot-event-v1" restricted={false} onClose={onClose} onSwitch={onSwitch} />);
    await screen.findByRole("heading", { name: "参加者" }, { timeout: 5000 });
    expect(screen.queryByRole("region", { name: "この対象から伸びる関係" })).toBeNull();
    expect(screen.getByRole("region", { name: "この対象へ向かう関係" })).toBeDefined();
    expect(screen.getByRole("img", { name: "人物 → 参加した → この出来事" })).toBeDefined();
    expect(screen.getByText("参加立場の記録：会議議長")).toBeDefined();
    const details = screen.getByText("主張・限定の内訳").closest("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("主張・限定の内訳"));
    expect(details.open).toBe(true);
    expect(screen.getByText("登録された主張の内訳：肯定 3件 ／ 否定 0件")).toBeDefined();
    expect(screen.getByText("参加上の立場を限定していない主張：肯定 2件 ／ 否定 0件")).toBeDefined();
    expect(screen.getByText(/人数・Graphの線・独立した出典/)).toBeDefined();
    expect(onSwitch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Graphに戻って関係を選ぶ" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchOverview).toHaveBeenCalledTimes(1);
  });
  it("否定のみの関係は初期表示から識別し、混在を異説とは呼ばない", async () => {
    const person = { ...entity, kind: "person" as const, name: "人工検証の人物" };
    vi.mocked(fetchOverview).mockResolvedValue({ ...response([relation({ perspective: "subject", counts: counts(0, 2) }), relation({ predicate: "AFFILIATED_WITH", perspective: "subject", counts: counts(1, 1) })]), entity: person });
    render(<EntityOverview entity={person} dataset="pilot-event-v1" restricted onClose={vi.fn()} onSwitch={vi.fn()} />);
    await screen.findByText("否定の主張のみ");
    expect(screen.getByText("この種類の関係を肯定する主張は登録されていません。")).toBeDefined();
    expect(screen.getByText("肯定・否定の主張あり")).toBeDefined();
    expect(screen.queryByText(/異説/)).toBeNull();
    expect(screen.getByTestId("overview-PARTICIPATED_IN-subject").dataset.polarity).toBe("denied");
  });
  it("0件と失敗を分け、再試行と404時の起点切替制限を維持する", async () => {
    vi.mocked(fetchOverview).mockRejectedValueOnce(new ClientApiError("対象が見つかりません", 404));
    vi.mocked(fetchOverview).mockResolvedValueOnce(response([]));
    render(<EntityOverview entity={entity} dataset="pilot-event-v1" restricted onClose={vi.fn()} onSwitch={vi.fn()} />);
    await screen.findByRole("alert");
    expect((screen.getByRole("button", { name: "この対象から広く見る" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "関係概要を再試行" }));
    await screen.findByText("公開された関係の主張はまだ登録されていません。");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect((screen.getByRole("button", { name: "この対象から広く見る" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
