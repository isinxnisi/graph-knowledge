#!/usr/bin/env python3
"""Timeline persistence checks against the dedicated local preview only."""
import copy
import datetime
import json
from pathlib import Path
import urllib.error
import urllib.request
import uuid

BASE = "http://localhost:3276"
checks = []


def request(query="", body=None, expected=200):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    req = urllib.request.Request(BASE + "/api/themes" + query, data=data,
                                 headers={"Content-Type": "application/json", "Origin": BASE})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            status, value = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        status, value = error.code, json.load(error)
    assert status == expected, (status, value)
    return value


def post(action, **values):
    return request(body={"requestId": str(uuid.uuid4()), "action": action, **values})


def check(label, condition):
    assert condition, label
    checks.append(label)


package = json.loads((Path(__file__).resolve().parents[1] / "public/theme-examples/webb-timeline.json").read_text())
package["id"] = "timeline-check-" + uuid.uuid4().hex[:10]
package["title"] = "年表HTTP検証専用"
theme = post("import", package=package)
check("axes and inset relationships persist", theme["timeline"] == package["timeline"])
parent = post("capsule-create", themeId=theme["id"], recordIds=["secondary-deployment"])
check("parent-only capsule does not include hidden child records or axes", len(parent["snapshot"]["records"]) == 1 and len(parent["snapshot"]["timeline"]["axes"]) == 1 and not parent["snapshot"]["timeline"]["insets"])
check("snapshot excludes unselected entity descriptions", len(parent["snapshot"]["entities"]) == 2)
child = post("capsule-create", themeId=theme["id"], recordIds=["secondary-start"])
check("child-only snapshot retains date and timezone context", not child["snapshot"]["timeline"]["insets"] and "EST" in child["snapshot"]["timeline"]["axes"][0]["originLabel"])
complete = post("capsule-create", themeId=theme["id"], recordIds=[r["id"] for r in theme["records"]])
complete = post("share", id=complete["id"], expected=1)
token = complete["shareToken"]
shared = request("?shared=" + token)
check("shared snapshot preserves nested axes and approximate clock labels", shared["snapshot"]["timeline"] == theme["timeline"] and "頃" in shared["snapshot"]["records"][-1]["time"]["from"])
record = copy.deepcopy(package["records"][4])
record["scope"] += "（検証用の補足）"
theme = post("record", themeId=theme["id"], expected=theme["revision"], record=record, reason="HTTP訂正検証")
check("ordinary record correction leaves shared timeline unchanged", request("?shared=" + token) == shared)
complete = post("capsule-refresh", id=complete["id"], expected=complete["revision"], themeRevision=theme["revision"], recordIds=[record["id"]])
check("explicit correction preserves inset context", complete["snapshot"]["timeline"] == package["timeline"] and complete["snapshot"]["records"][4]["scope"] == record["scope"])
invalid = {**record, "time": None}
request(body={"requestId": str(uuid.uuid4()), "action": "record", "themeId": theme["id"], "expected": theme["revision"], "record": invalid, "reason": "軸に合わない訂正"}, expected=400)
check("invalid axis correction is rejected without modifying stored content", request("?theme=" + theme["id"])["revision"] == theme["revision"])
complete = post("share", id=complete["id"], expected=complete["revision"])
check("same URL publishes corrected timeline snapshot", complete["shareToken"] == token and request("?shared=" + token)["revision"] == complete["revision"])
published_before_detachment = request("?shared=" + token)
saved_parent = copy.deepcopy(next(r for r in complete["snapshot"]["records"] if r["id"] == record["id"]))
theme = post("record", themeId=theme["id"], expected=theme["revision"], record=invalid,
             reason="検証用：時期を未確定へ訂正し明示配置を外す", detachTimelinePlacement=True)
stored_theme = request("?theme=" + theme["id"])
expected_detached_timeline = copy.deepcopy(package["timeline"])
expected_detached_timeline["placements"] = [p for p in expected_detached_timeline["placements"] if p["recordId"] != record["id"]]
check("explicit detachment persists the undated parent and retains its child inset",
      next(r for r in stored_theme["records"] if r["id"] == record["id"])["time"] is None
      and stored_theme["timeline"] == expected_detached_timeline)
other_record = copy.deepcopy(package["records"][0])
other_record["scope"] += "（別記録の取込検証）"
theme = post("record", themeId=theme["id"], expected=theme["revision"], record=other_record, reason="別記録のみの訂正")
complete = post("capsule-refresh", id=complete["id"], expected=complete["revision"], themeRevision=theme["revision"], recordIds=[other_record["id"]])
check("refreshing another record keeps the saved parent placement and child inset",
      next(r for r in complete["snapshot"]["records"] if r["id"] == other_record["id"])["scope"] == other_record["scope"]
      and next(r for r in complete["snapshot"]["records"] if r["id"] == record["id"]) == saved_parent
      and complete["snapshot"]["timeline"] == package["timeline"])
check("detachment and an unrelated snapshot refresh leave the published version unchanged",
      request("?shared=" + token) == published_before_detachment)
complete = post("capsule-refresh", id=complete["id"], expected=complete["revision"], themeRevision=theme["revision"], recordIds=[record["id"]])
check("explicit parent refresh removes only its placement and preserves the nested axis context",
      next(r for r in complete["snapshot"]["records"] if r["id"] == record["id"])["time"] is None
      and complete["snapshot"]["timeline"] == expected_detached_timeline)
check("taking in the parent correction does not overwrite the old shared snapshot",
      request("?shared=" + token) == published_before_detachment)
complete = post("share", id=complete["id"], expected=complete["revision"])
published_after_detachment = request("?shared=" + token)
check("explicit sharing publishes the detached timeline at the same URL",
      complete["shareToken"] == token
      and published_after_detachment["revision"] == complete["revision"]
      and published_after_detachment["snapshot"] == complete["snapshot"]
      and published_after_detachment["snapshot"]["timeline"] == expected_detached_timeline)
post("share", id=complete["id"], expected=complete["revision"], stop=True)
request("?shared=" + token, expected=404)
check("stopped timeline share is inaccessible", True)
print(json.dumps({"checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "themeId": theme["id"], "checks": checks, "count": len(checks)}, ensure_ascii=False, indent=2))
