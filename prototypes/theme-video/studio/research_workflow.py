"""Keep collected evidence on the trial that asked for it and resume writing with verified sources."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json

from editor import MaterialRequired, _save_json
from editorial_decision import assess
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
            if entry.get("remaining") and not entry.get("inheritedFromRun"):
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


def _history(folder):
    path = folder / "material-research.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"rounds": []}


def _assess_saved(enriched, brief, model, effort, folder, need, rounds, progress, language, *, cached_only=False):
    last = next((r for r in reversed(rounds) if r["status"] == "done" and not r.get("inheritedFromRun")), {})
    if not last:
        raise MaterialRequired(need)
    try:
        return assess(enriched, brief, model, effort, folder, need, last.get("remaining", ""), progress,
                      language, cached_only=cached_only)
    except ValueError as exc:
        outstanding = last.get("remaining") or need
        raise MaterialRequired(f"{outstanding}（保存した資料の編集判断を完了できませんでした。{exc}）") from exc


def reassess_saved_material(snapshot, brief, model, effort, folder, need, progress=None, *, language="ja"):
    """Assess an existing waiting run in place, without searching, writing a script, or changing its ledger."""
    rounds = _history(folder)["rounds"]
    record, _ = _assess_saved(_supplement(snapshot, rounds), brief, model, effort, folder, need, rounds, progress, language)
    return record["decision"]


def write_with_research(snapshot, brief, model, effort, folder, progress, write, *, language="ja"):
    path = folder / "material-research.json"
    history = _history(folder)
    rounds = history["rounds"]
    proposal = folder / "editorial-alternative.json"
    decision_file = folder / "editorial-decision.json"
    def save():
        _save_json(path, history)
    def report(message):
        if progress:
            progress(message)
    def write_plan(materials):
        plan = write(materials)
        proposal.unlink(missing_ok=True)
        return plan
    def apply_decision(enriched, record):
        decision = record["decision"]
        if decision["outcome"] != "revise":
            raise MaterialRequired(decision["reason"])
        if record.get("rewriteNeed"):
            raise MaterialRequired(record["rewriteNeed"])
        report("元案の導入と発見を保ち、保存した資料に合わせて台本を改稿中")
        try:
            return write_plan({**enriched, "editorialDirection": decision["direction"]})
        except MaterialRequired as exc:
            record["rewriteNeed"] = str(exc)
            _save_json(decision_file, record)
            raise
    def reconsider(enriched, need):
        record, _ = _assess_saved(enriched, brief, model, effort, folder, need, rounds, progress, language)
        return apply_decision(enriched, record)
    searches = 0
    need = None
    leads_path = folder / "material-leads.json"
    leads = json.loads(leads_path.read_text(encoding="utf-8"))["urls"] if leads_path.exists() else []
    own_rounds = [r for r in rounds if not r.get("inheritedFromRun")]
    searched_leads = {url for entry in own_rounds if entry["status"] == "done" for url in entry.get("sourceLeads", [])}
    if set(leads) - searched_leads:
        need = own_rounds[-1]["need"] if own_rounds else "追加された公開資料から、採用した動画案の要確認事項を調べてください。"
    check_saved = need is None and bool(own_rounds and own_rounds[-1]["status"] == "done")
    if check_saved and decision_file.is_file():
        old_need = json.loads(decision_file.read_text(encoding="utf-8"))["need"]
        enriched = _supplement(snapshot, rounds)
        record, matched = _assess_saved(enriched, brief, model, effort, folder, old_need, rounds, progress, language,
                                        cached_only=True)
        if matched:
            if record["decision"]["outcome"] == "revise" and not record.get("rewriteNeed"):
                return apply_decision(enriched, record)
            # The operator explicitly requested more research after this material wait.
            need = record.get("rewriteNeed") or old_need
            check_saved = False
    while True:
        enriched = _supplement(snapshot, rounds)
        if need is None:
            try:
                if not enriched["sources"]:
                    raise MaterialRequired("この企画を裏づける公開原資料を探してください。")
                return write_plan(enriched)
            except MaterialRequired as exc:
                need = str(exc)
        if check_saved or searches >= 2:
            return reconsider(enriched, need)
        # A retry after a process exit replaces only the unfinished search.
        unfinished = rounds[-1] if rounds and rounds[-1]["status"] == "searching" else None
        entry = unfinished or {"startedAt": _now(), "sources": [], "remaining": "", "status": "searching"}
        if not unfinished:
            rounds.append(entry)
        entry["need"] = need
        report(f"資料を追加調査中（{len(rounds)}回目）　" + need)
        prior = [{"sources": r["sources"]} if r.get("inheritedFromRun") else
                 {k: r.get(k) for k in ("need", "sources", "remaining", "error")} for r in rounds[:-1]]
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
            return reconsider(_supplement(snapshot, rounds), need)
        need = None
        proposal.unlink(missing_ok=True)
        report("追加資料を保存しました。出典を加えて企画と台本を見直します。")
