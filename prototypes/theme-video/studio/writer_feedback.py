"""Validate each model response and pass actionable feedback back to its author."""
from copy import deepcopy
import hashlib
import json

from editor import MaterialRequired, _save_json, _writer_request


class RevisionNeeded(ValueError):
    """The saved draft needs another revision before it can be accepted."""


def request_digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode()).hexdigest()


_CORRECTION = """前の回答を確認すると、validationFeedbackの指摘がありました。previousOutputを読み直し、
指摘された箇所とそれに関係する箇所を直して、同じ形式で回答全体を返してください。
元の依頼、根拠、既に成立している内容を保ってください。材料が足りないときは元の指示に従ってください。"""


def validated_output(*, name, label, records, request, instructions, inputs, validate, writer, progress=None):
    """Return the validated value, accepted request, cache flag and usage for its attempt chain."""
    records.mkdir(parents=True, exist_ok=True)
    base = request
    usage = {}
    attempt = 0
    new_corrections = 0
    issue = ""
    consecutive = 0
    while True:
        digest = request_digest(request)
        stage = name if attempt == 0 else f"{name}-repair-{attempt}"
        path = records / f"{stage}-{digest}.json"
        entry = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        cached = (entry.get("request") == request and entry.get("status") in ("done", "failed")
                  and "result" in entry)
        if progress and (attempt == 0 or not cached):
            progress(label if not attempt else f"{label}（指摘を返して修正中・{attempt}回目）{issue}")
        if not cached:
            if attempt:
                new_corrections += 1
            entry = {"stage": stage, "request": request, "status": "running", "inputSha256": digest}
            _save_json(path, entry)
            try:
                entry["result"], entry["usage"] = writer(request)
            except Exception as exc:
                entry.update(status="failed", error=str(exc))
                _save_json(path, entry)
                raise
        for key, count in (entry.get("usage") or {}).items():
            if isinstance(count, int):
                usage[key] = usage.get(key, 0) + count
        try:
            # Some checks annotate the validated value. Keep the original model response for replay.
            value = validate(deepcopy(entry["result"]))
        except MaterialRequired as exc:
            entry.update(status="failed", error=str(exc))
            _save_json(path, entry)
            raise
        except ValueError as exc:
            next_issue = str(exc)
            consecutive = consecutive + 1 if next_issue == issue else 1
            issue = next_issue
            entry.update(status="failed", error=issue)
            _save_json(path, entry)
            if not cached and new_corrections >= 2 and consecutive >= 3:
                raise RevisionNeeded("2回修正しても同じ指摘が解消しなかったため、この工程の自動修正を止めました。" + issue) from exc
            if new_corrections >= 5:
                raise RevisionNeeded("この工程で5回自動修正しましたが、確認を通らなかったため停止しました。" + issue) from exc
            attempt += 1
            correction = {**inputs, "previousOutput": entry["result"], "validationFeedback": issue,
                          "correctionAttempt": attempt}
            request = {**base, **_writer_request(base["model"], base["effort"], base["instructionVersion"],
                                                 instructions + "\n\n" + _CORRECTION, correction, base["outputSchema"])}
            continue
        except Exception as exc:
            entry.update(status="failed", error=str(exc))
            _save_json(path, entry)
            raise
        if entry.get("status") != "done":
            entry["status"] = "done"
            if "error" in entry:
                entry["previousValidationError"] = entry.pop("error")
            _save_json(path, entry)
        return value, request, cached, usage
