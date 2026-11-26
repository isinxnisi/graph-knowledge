"""Keep the reviewed drawings, cut and outstanding observations together across resumes."""
import hashlib
import json
from pathlib import Path
import tempfile

from writer_feedback import request_digest


FILE = "film-cut.json"
LEGACY_VERSION = "plunode-film-direction-2"


def _read(path):
    return json.loads(path.read_bytes())


def _inputs(req):
    return json.loads(req["prompt"].rsplit("\n\n", 1)[-1])


def _hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path else None


def _context(facts, model, effort, image_hash):
    return request_digest([facts, model, effort, image_hash])


def save_cut(folder, facts, model_id, effort, previous_cut, *, plan, direction_hash, seen, review, history, usage):
    from editor import _save_json
    cut = dict(plan=plan, direction_hash=direction_hash, seen=seen, review=review, history=history, usage=usage)
    context = _context(facts, model_id, effort, _hash(previous_cut))
    _save_json(folder / FILE, {"version": 1, "context": context, "cut": cut, "sha256": request_digest([context, cut])})


def _native(folder):
    data = _read(folder / FILE)
    if data.get("version") != 1 or data.get("sha256") != request_digest([data.get("context"), data.get("cut")]):
        raise ValueError("保存した試写稿の照合に失敗しました。制作記録を確認してください。")
    return data


def _legacy_context(req):
    facts = _inputs(req)
    image_hash = facts.pop("imageSha256", None)
    for extra in ("candidate", "correctionAttempt", "validationFeedback", "previousOutput"):
        facts.pop(extra, None)
    return facts, _context(facts, req["model"], req["effort"], image_hash)


def _legacy(folder, request, facts):
    from authored_art import validate_art
    from film_direction import check_direction, check_observations, check_review, evidence_for, proof_sheet, scene_state

    ids = [s["id"] for s in facts["sources"]]
    records = folder / "editor-stages"
    artworks, catalog, observed, passes, counts = {}, {}, set(), {}, {}
    plan = None
    for path in sorted(records.glob("*.json"), key=lambda p: (p.stat().st_mtime_ns, p.name)):
        entry = _read(path)
        req = entry.get("request", {})
        if (req.get("instructionVersion") != LEGACY_VERSION
                or req.get("model") != request["model"] or req.get("effort") != request["effort"]
                or entry.get("inputSha256") != request_digest(req)):
            continue
        # Count recorded responses once, including validation corrections that
        # consumed tokens and never made it into the selected cut.
        for key, value in (entry.get("usage") or {}).items():
            if isinstance(value, int):
                counts[key] = counts.get(key, 0) + value
        if entry.get("status") != "done":
            continue
        stage = entry["stage"].split("-repair-")[0]
        raw, inputs = entry["result"], _inputs(req)
        if req == request:
            plan = check_direction(raw["direction"] if stage == "direction-material" else raw, ids)
        if not plan:
            continue
        scene_ids = [s["id"] for s in plan["scenes"]]
        beat = plan["visualBeat"]
        if stage.startswith("art-") and inputs.get("style") == plan["style"]:
            ref = inputs.get("reusableLayers", {}).get("artSha256")
            if ref and ref not in catalog:
                continue
            art = validate_art(raw, catalog.get(ref))
            catalog[request_digest(art)] = art
            artworks[inputs["scene"]["id"]] = art
        elif stage.startswith("look-"):
            rows = check_observations(raw, inputs["sceneIds"], inputs.get("focusSceneId"))
            observed.add((tuple(inputs["sceneIds"]), request_digest(rows), inputs["imageSha256"]))
        elif stage == "edit-review":
            cut, seen = inputs["cut"], inputs["viewer"]
            used = {sid for shot in cut for sid in shot["sourceIds"]}
            expected = {"commission": facts["commission"], "story": plan["story"], "visualBeat": beat,
                        **evidence_for(facts, used)}
            if (not all(inputs.get(k) == v for k, v in expected.items())
                    or [s["id"] for s in cut] != scene_ids or any(i not in artworks for i in scene_ids)
                    or [s["sceneId"] for s in seen] != scene_ids):
                continue
            signals = seen[scene_ids.index(beat["sceneId"])]["focusSignals"]
            try:
                review = check_review(raw, scene_ids, beat, signals)
            except ValueError:
                continue
            shots = [{**s, "art": artworks[s["id"]]} for s in cut]
            passes[inputs["pass"]] = ({**plan, "scenes": shots}, seen, review, inputs["imageSha256"])

    if not passes:
        return None
    last = max(passes)
    if set(passes) != set(range(1, last + 1)):
        return None
    plan, seen, review, focus_hash = passes[last]
    # Old runs saved no atomic cut. Verify each page against the actual JPG
    # seen by its blind reviewer before reusing feedback about that edition.
    with tempfile.TemporaryDirectory() as scratch:
        for offset in range(0, len(seen), 4):
            shots = plan["scenes"][offset:offset + 4]
            group = tuple(s["id"] for s in shots)
            digest = _hash(proof_sheet(Path(scratch), shots, plan["visualBeat"]))
            if ((group, request_digest(seen[offset:offset + 4]), digest) not in observed
                    or (plan["visualBeat"]["sceneId"] in group and focus_hash != digest)):
                return None
    history = []
    for number in range(1, last):
        old_shots = {s["id"]: s for s in passes[number][0]["scenes"]}
        new_shots = {s["id"]: s for s in passes[number + 1][0]["scenes"]}
        notes = []
        for issue in passes[number][2]["repairs"]:
            old, new = old_shots[issue["sceneId"]], new_shots[issue["sceneId"]]
            changes = [k for k in new if new[k] != old.get(k)]
            action = "artist" if "art" in changes else "keep"
            decision = "原画を差し替えました。" if action == "artist" else "同じ原画を使いました。"
            notes.append({**issue, "action": action, "changes": changes, "decision": decision,
                          "beforeState": scene_state(old), "afterState": scene_state(new)})
        history.append(notes)
    return dict(plan=plan, direction_hash=_hash(folder / "editor-input.json"), seen=seen,
                review=review, history=history, usage=counts)


def _old_request(folder):
    path = folder / "editor-input.json"
    if path.is_file():
        req = _read(path)
        if req.get("instructionVersion") == LEGACY_VERSION:
            return req
    return None


def load_cut(folder, facts, model_id, effort, previous_cut=None):
    expected = _context(facts, model_id, effort, _hash(previous_cut))
    if (folder / FILE).is_file():
        data = _native(folder)
        return data["cut"] if data["context"] == expected else None
    req = _old_request(folder)
    if req and _legacy_context(req)[1] == expected:
        cut = _legacy(folder, req, facts)
        if cut is None and any(p for p in (folder / "editor-stages").glob("edit-review-*.json")
                               if _read(p).get("status") == "done"):
            from writer_feedback import RevisionNeeded
            raise RevisionNeeded("過去の試写画像と保存原画を照合できず、改稿を始める前に停止しました。"
                                 "この試行の保存記録を確認するか、新しい試行で制作を始めてください。")
        return cut
    return None


def read_saved_cut(folder):
    if (folder / FILE).is_file():
        return _native(folder)["cut"]
    req = _old_request(folder)
    if req:
        return _legacy(folder, req, _legacy_context(req)[0])
    return None
