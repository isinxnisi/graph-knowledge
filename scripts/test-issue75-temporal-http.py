#!/usr/bin/env python3
"""Temporal meaning checks against the isolated 3276 preview; no existing data is removed."""
import copy
import datetime
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = "http://localhost:3276"
PREFIX = "time-meaning-check-"
checks = []
artifacts = {
    "themeId": PREFIX + uuid.uuid4().hex[:10],
    "capsuleIds": [],
    "recordIds": ["point", "duration", "window", "legacy", "uncertain-ends"],
    "sharedUrls": [],
    "sharesStopped": False,
}


def request(query="", body=None, expected=200, path="/api/themes"):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    req = urllib.request.Request(
        BASE + path + query,
        data=data,
        headers={"Content-Type": "application/json", "Origin": BASE},
    )
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


def by_id(records, record_id):
    return next(record for record in records if record["id"] == record_id)


def search_ids(query):
    return {
        hit["record"]["id"]
        for hit in request("?" + urllib.parse.urlencode({"q": query}))
        if hit["themeId"] == artifacts["themeId"]
    }


def make_record(record_id, subject, time):
    return {
        "id": record_id,
        "kind": "episode",
        "subject": subject,
        "object": None,
        "relation": "",
        "assertion": "合成試験記録 " + record_id,
        "scope": "HTTP契約の構造試験。実在する出来事や対象間の所属を主張しない。",
        "polarity": "affirmed",
        "time": {"kind": "calendar", "label": "入力原文 " + record_id, **time},
        "evidence": [{
            "url": "https://example.org/time-meaning-check",
            "title": "合成構造試験（実資料ではない）",
            "locator": "時期の意味と保存断面のHTTP試験",
            "excerpt": "同じ時期だけを理由として、記録間の所属や関係を作らない。",
            "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        }],
    }


def main():
    records = [
        make_record("point", "subject-a", {"meaning": "point", "from": "1987"}),
        make_record("duration", "subject-b", {"meaning": "duration", "from": "1985", "to": "1989"}),
        make_record("window", "subject-a", {"meaning": "occurrence-window", "from": "1985", "to": "1989"}),
        make_record("legacy", "subject-b", {"from": "1985", "to": "1989"}),
        make_record("uncertain-ends", "subject-a", {
            "meaning": "duration", "from": "1985", "to": "1989",
            "startLatest": "1988", "endEarliest": "1986",
        }),
    ]
    package = {
        "schemaVersion": 1,
        "id": artifacts["themeId"],
        "title": "時期の意味・HTTP検証専用",
        "description": "合成構造試験。既存テーマと別IDで保存し、試験後も自動削除しない。",
        "entities": [
            {"id": "subject-a", "name": "合成対象A", "kind": "対象"},
            {"id": "subject-b", "name": "合成対象B", "kind": "対象"},
        ],
        "records": records,
        "timeline": {
            "version": 1,
            "axes": [{"id": "calendar", "kind": "calendar", "label": "合成時期の比較"}],
            "placements": [{"recordId": r["id"], "axisId": "calendar"} for r in records],
            "insets": [],
        },
    }
    theme = post("import", package=package)
    stored = request("?theme=" + theme["id"])
    expected_times = {r["id"]: r["time"] for r in records}
    check("import and reread preserve point, duration, occurrence window, legacy and crossed endpoint windows",
          {r["id"]: r["time"] for r in stored["records"]} == expected_times)
    check("legacy range receives no invented meaning and crossed uncertainty is accepted",
          "meaning" not in by_id(stored["records"], "legacy")["time"]
          and by_id(stored["records"], "uncertain-ends")["time"]["startLatest"] == "1988"
          and by_id(stored["records"], "uncertain-ends")["time"]["endEarliest"] == "1986")
    check("search distinguishes possible occurrence from duration", search_ids("発生時期の幅") == {"window"})
    check("search keeps legacy ranges explicitly undecided", search_ids("未区別") == {"legacy"})
    check("search includes uncertain endpoint values", search_ids("1988") == {"uncertain-ends"})
    check("search includes a partial-year point without inventing a day", search_ids("1987") == {"point"})
    graph = request("?theme=" + theme["id"], path="/api/themes/graph")
    check("overlapping dates create neither Graph relations nor implicit inset membership",
          not graph["document"]["relations"]
          and not graph["document"]["texts"] and not graph["document"]["nodes"]
          and stored["timeline"] == package["timeline"])
    check("timeline-only temporal records stay in their source rather than Graph annotations",
          not graph["document"]["evidence"]
          and {r["id"]: r["time"] for r in stored["records"]} == expected_times)

    cap = post("capsule-create", themeId=theme["id"], recordIds=artifacts["recordIds"])
    artifacts["capsuleIds"].append(cap["id"])
    check("Capsule snapshot retains all temporal fields and creates no relations",
          {r["id"]: r["time"] for r in cap["snapshot"]["records"]} == expected_times
          and not cap["document"]["relations"])
    cap = post("capsule-save", id=cap["id"], expected=cap["revision"],
               title="時期の意味・保存確認", description="明示保存の検証", document=cap["document"])
    saved = request("?capsule=" + cap["id"])["capsule"]
    check("ordinary Capsule save preserves its original temporal snapshot", saved["snapshot"] == cap["snapshot"])
    cap = post("share", id=cap["id"], expected=cap["revision"])
    token = cap["shareToken"]
    artifacts["sharedUrls"].append(BASE + "/themes/shared/" + token)
    shared = request("?shared=" + token)
    check("initial sharing preserves the saved temporal snapshot", shared["snapshot"] == cap["snapshot"])

    corrected_window = copy.deepcopy(by_id(records, "window"))
    corrected_window["time"]["meaning"] = "duration"
    theme = post("record", themeId=theme["id"], expected=theme["revision"],
                 record=corrected_window, reason="合成検証：発生の幅から実期間へ訂正")
    corrected_ends = copy.deepcopy(by_id(records, "uncertain-ends"))
    corrected_ends["time"]["startLatest"] = "1987-06"
    corrected_ends["time"]["endEarliest"] = "1986-08"
    theme = post("record", themeId=theme["id"], expected=theme["revision"],
                 record=corrected_ends, reason="合成検証：開始と終了の不確かな幅を訂正")
    envelope = request("?capsule=" + cap["id"])
    check("time meaning and boundary corrections both increment content revisions",
          theme["revision"] == stored["revision"] + 2
          and {d["recordId"]: d["kind"] for d in envelope["diff"]} == {"window": "content", "uncertain-ends": "content"}
          and all(d["after"]["revision"] == d["before"]["revision"] + 1 for d in envelope["diff"]))
    check("source corrections leave saved and shared snapshots unchanged",
          envelope["capsule"]["snapshot"] == cap["snapshot"] and request("?shared=" + token) == shared)
    check("search follows explicitly corrected temporal meaning and new boundary precision",
          search_ids("発生時期の幅") == set() and search_ids("1987-06") == {"uncertain-ends"})

    cap = post("capsule-refresh", id=cap["id"], expected=cap["revision"],
               themeRevision=theme["revision"], recordIds=["window"])
    envelope = request("?capsule=" + cap["id"])
    check("selected refresh imports only the chosen time meaning, retaining the other saved boundary window",
          by_id(cap["snapshot"]["records"], "window")["time"] == corrected_window["time"]
          and by_id(cap["snapshot"]["records"], "uncertain-ends")["time"] == expected_times["uncertain-ends"]
          and [d["recordId"] for d in envelope["diff"]] == ["uncertain-ends"])
    check("selected correction intake does not republish the old shared content", request("?shared=" + token) == shared)
    cap = post("share", id=cap["id"], expected=cap["revision"])
    selected_shared = request("?shared=" + token)
    check("explicit sharing updates the same URL with the selected correction only",
          cap["shareToken"] == token and selected_shared["revision"] == cap["revision"]
          and selected_shared["snapshot"] == cap["snapshot"]
          and by_id(selected_shared["snapshot"]["records"], "uncertain-ends")["time"] == expected_times["uncertain-ends"])

    cap = post("capsule-refresh", id=cap["id"], expected=cap["revision"],
               themeRevision=theme["revision"], recordIds=["uncertain-ends"])
    check("explicit boundary intake retains partial precision, the legacy range and relation count",
          by_id(cap["snapshot"]["records"], "uncertain-ends")["time"] == corrected_ends["time"]
          and by_id(cap["snapshot"]["records"], "legacy")["time"] == expected_times["legacy"]
          and cap["snapshot"]["timeline"] == package["timeline"]
          and not cap["document"]["relations"])
    check("taking in uncertain boundaries also leaves the prior published snapshot unchanged",
          request("?shared=" + token) == selected_shared)
    cap = post("share", id=cap["id"], expected=cap["revision"])
    published = request("?shared=" + token)
    check("the same URL publishes the explicitly accepted uncertain boundary correction",
          cap["shareToken"] == token and published["revision"] == cap["revision"]
          and published["snapshot"] == cap["snapshot"]
          and not request("?capsule=" + cap["id"])["diff"])
    post("share", id=cap["id"], expected=cap["revision"], stop=True)
    request("?shared=" + token, expected=404)
    artifacts["sharesStopped"] = True
    check("stopping the share denies public access while keeping the saved Capsule",
          request("?capsule=" + cap["id"])["capsule"]["snapshot"] == cap["snapshot"])


if __name__ == "__main__":
    status = "failed"
    error_message = None
    try:
        main()
        status = "passed"
    except Exception as error:
        error_message = str(error)
        raise
    finally:
        print(json.dumps({
            "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "base": BASE,
            "status": status,
            "error": error_message,
            "createdArtifacts": artifacts,
            "checks": checks,
            "count": len(checks),
            "cleanup": "No data deleted. The generated theme/capsule IDs identify this run for optional later cleanup.",
        }, ensure_ascii=False, indent=2))
