"""Keep collected evidence on the trial that asked for it and resume writing with verified sources."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json

from editor import MaterialRequired, _save_json
from material_research import research_material


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _source_id(source):
    identity = [source["url"], source["excerpt"]]
    return "research-" + hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()[:16]


def _supplement(snapshot, rounds):
    accepted = {}
    limitations = []
    for entry in rounds:
        if entry["status"] == "done":
            for source in entry["sources"]:
                accepted[_source_id(source)] = source
            if entry.get("remaining"):
                limitations.append(entry["remaining"])
    if not accepted:
        return snapshot
    result = deepcopy(snapshot)
    for sid, source in accepted.items():
        result["sources"].append({"id": sid, **source})
        result["records"].append({"text": source["note"], "evidence": [
            {"id": sid, "locator": source["locator"], "excerpt": source["excerpt"]}]})
    result["productionResearch"] = {"sourceIds": list(accepted), "limits": limitations[-2:]}
    return result


def write_with_research(snapshot, brief, model, effort, folder, progress, write):
    path = folder / "material-research.json"
    history = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"rounds": []}
    rounds = history["rounds"]
    def save():
        _save_json(path, history)
    def report(message):
        if progress:
            progress(message)
    searches = 0
    need = None
    leads_path = folder / "material-leads.json"
    leads = json.loads(leads_path.read_text(encoding="utf-8"))["urls"] if leads_path.exists() else []
    searched_leads = {url for entry in rounds if entry["status"] == "done" for url in entry.get("sourceLeads", [])}
    if set(leads) - searched_leads:
        need = rounds[-1]["need"] if rounds else "追加された公開資料から、採用した動画案の要確認事項を調べてください。"
    while True:
        enriched = _supplement(snapshot, rounds)
        if need is None:
            try:
                if not enriched["sources"]:
                    raise MaterialRequired("この企画を裏づける公開原資料を探してください。")
                return write(enriched)
            except MaterialRequired as exc:
                need = str(exc)
        if searches >= 2:
            raise MaterialRequired(need)
        # A retry after a process exit replaces only the unfinished search.
        unfinished = rounds[-1] if rounds and rounds[-1]["status"] == "searching" else None
        entry = unfinished or {"startedAt": _now(), "sources": [], "remaining": "", "status": "searching"}
        if not unfinished:
            rounds.append(entry)
        entry["need"] = need
        report(f"資料を追加調査中（{len(rounds)}回目）　" + need)
        prior = [{k: r.get(k) for k in ("need", "sources", "remaining", "error")} for r in rounds[:-1]]
        if leads:
            entry["sourceLeads"] = leads
        save()
        try:
            result = research_material(snapshot, brief, need, model, effort, prior, progress, leads=leads)
        except Exception as exc:
            from ledger import Paused
            if not isinstance(exc, Paused):
                entry.update(status="error", finishedAt=_now(), error=str(exc)[:1200])
                save()
            raise
        entry.update(result, status="done", finishedAt=_now())
        save()
        searches += 1
        before = {s["id"] for s in enriched["sources"]}
        if not any(_source_id(s) not in before for s in entry["sources"]):
            if entry.get("retrySearch") and searches < 2:
                report("候補の本文を照合できなかったため、別の資料を探します。")
                continue
            raise MaterialRequired(entry["remaining"] or need)
        need = None
        report("追加資料を保存しました。出典を加えて企画と台本を見直します。")
