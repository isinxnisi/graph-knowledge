#!/usr/bin/env python3
"""Prepare private MCP inputs without making any network or database writes."""
from copy import deepcopy
import argparse
import json
from pathlib import Path
from uuid import uuid4

ASSETS = Path(__file__).resolve().parents[1] / "docs/runbooks/theme-production-continuity"


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def prepare_guide(value):
    # The management response has a pinned revision. Fully hydrate the bodies
    # and assistance before calling this helper.
    revision = value["versions"]["revision"]
    if value["currentRevision"] != revision:
        raise ValueError("Select and hydrate the current revision before editing.")
    content = deepcopy(value["content"])
    bodies = {key: (content["required"], key) for key in content["required"]}
    bodies.update({row["key"]: (row, "markdown") for row in content["sections"]})
    if any(not isinstance(row.get(key), str) for row, key in bodies.values()):
        raise ValueError("Hydrate all deferred bodyKey fields.")
    if not isinstance(content["assistance"], list) or any("bodyKey" in a for a in content["assistance"]):
        raise ValueError("Hydrate deferred assistance before editing.")
    for edit in load(ASSETS / "guide-edits.json"):
        row, key = bodies[edit["section"]]
        if row[key].count(edit["before"]) != 1:
            raise ValueError(f"Reconcile the changed guide text in {edit['section']}.")
        row[key] = row[key].replace(edit["before"], edit["after"], 1)
    return {"expectedRevision": revision, "requestId": str(uuid4()),
            "reason": "制作継続と後日対応・非公開退避の判断を明確化", "changes": content}


def prepare_darwin(claim, followup_list):
    template = load(ASSETS / "darwin-checkpoint.json")
    state = claim["case"]
    if (claim.get("outcome") != "claimed" or state["id"] != template["caseId"]
            or state["environment"] != "production" or state["origin"] != "https://plunode.net"
            or state["theme"] != template["theme"] or state["workflow"] != "scheduled"
            or state["phase"] != "production" or state["status"] != "blocked"
            or state["pendingSubmissionCount"] or state["publication"]["pending"]
            or state["publication"]["publishedRevision"] is not None or not state["lease"]["valid"]):
        raise ValueError("Read and reconcile the live case before applying this checkpoint.")
    progress = deepcopy(state["progress"])
    artifacts = progress["artifacts"]
    old = {key: progress[key] for key in ("unfinished", "blockers", "scope")}
    old["workLoop"] = artifacts["workLoop"]
    if old != template["baseline"]:
        raise ValueError("Saved waiting conditions changed. Reclassify the current work first.")
    artifacts["continuityMigration20261125"] = {
        "priorCaseVersion": state["version"], "theme": state["theme"], "previousProgressInstructions": old,
        "previousMaterialResume": artifacts.get("latestMaterialCheckpoint", {}).get("resume"),
    }
    artifacts["workLoop"] = {
        "v": 1, "focus": "第9版の制作引継ぎ",
        "goal": "日英各16行の作業稿と後日対応を独立見直しに引き継ぐ",
        "doneWhen": "現行版・参照・後日対応と、独立見直しで視認する箇所を読戻し、handoffの結果を確認した",
        "nextAction": "第9版の年表・Story・根拠・既存画像参照を照合し、公開に必要な制作側の重要な残件を判断する。成立する稿は独立見直しへ引き継ぐ。",
        "waitingOn": None,
    }
    if "latestMaterialCheckpoint" in artifacts:
        artifacts["latestMaterialCheckpoint"]["resume"] = "未掲載の史料画像・書影・購入先は後日対応から再開条件を確認する。現行稿は独立見直しで評価する。"
    progress["scope"] = progress["scope"].replace(
        "実資料の肖像、手稿、共同論文・初版図版を優先し権利とトリミングを確認。関連商品は『種の起源』の適切な版を確認し、出典と購入先を区別。",
        "実際に掲載する画像の権利と表示を確認する。候補の史料画像と『種の起源』の書影・購入先は後日対応を参照する。")
    progress["unfinished"] = ["作業版と制作側の必須残件を照合して独立見直しへ引き継ぐ。実際の画像表示と作品の全体評価は独立見直しで行う。"]
    progress["blockers"] = []
    links = template["followUps"]
    for link in links:
        if link["scope"] == "shared" and any(
                row["scope"] == "shared" and row["key"] == link["key"] and row["record"]["status"] == "open"
                for row in followup_list["items"]):
            del link["record"]
        else:
            link["record"]["observedAt"] = template["observedAt"]
    return {"requestId": str(uuid4()), "caseId": state["id"], "expectedVersion": state["version"],
            "executionId": state["lease"]["executionId"], "leaseToken": claim["leaseToken"],
            "operation": "save", "status": "working", "progress": progress, "followUps": links}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)
    guide = sub.add_parser("guide")
    guide.add_argument("hydrated_guide")
    darwin = sub.add_parser("darwin")
    darwin.add_argument("claim")
    darwin.add_argument("matching_followups")
    args = parser.parse_args()
    result = (prepare_guide(load(args.hydrated_guide)) if args.mode == "guide"
              else prepare_darwin(load(args.claim), load(args.matching_followups)))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
