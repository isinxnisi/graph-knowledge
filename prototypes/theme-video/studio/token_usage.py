"""Normalize the token counts already saved by Studio's production paths."""
import json


def _counts(raw, model):
    if not isinstance(raw, dict):
        return {}
    claude = model.startswith("claude")
    keys = {
        "input": "input_tokens",
        "output": "output_tokens",
        "total": "total_tokens",
        "cachedInput": "cache_read_input_tokens" if claude else "cached_input_tokens",
        "cacheWriteInput": "cache_creation_input_tokens" if claude else "cache_write_input_tokens",
        "reasoningOutput": "reasoning_output_tokens",
    }
    counts = {name: raw[key] for name, key in keys.items()
              if type(raw.get(key)) is int and 0 <= raw[key] <= 2**53-1}
    if claude and "input" in counts:
        counts["input"] += counts.get("cachedInput", 0) + counts.get("cacheWriteInput", 0)
    if "input" in counts and "output" in counts:
        counts["total"] = counts["input"] + counts["output"]
    if not counts.keys() & {"input", "output", "total"}:
        return {}
    if raw.get("scope") == "parent-only":
        counts["partial"] = True
    return counts


def _merge(records, *, partial=False):
    if not records:
        return {}
    keys = ("input", "output", "total", "cachedInput", "cacheWriteInput", "reasoningOutput")
    counts = {key: sum(record.get(key, 0) for record in records)
              for key in keys if any(key in record for record in records)}
    incomplete = any("total" not in record for record in records)
    if incomplete:
        counts.pop("total", None)
    if partial or incomplete or any(record.get("partial") for record in records):
        counts["partial"] = True
    return counts


def run_tokens(folder, model, langs, *, direct, usage, parent_usage):
    """Return the recorded run total and its edition counts, if attributable."""
    if direct:
        editions = {}
        for lang in langs:
            if lang not in ("ja", "en"):
                continue
            phases = []
            for stage in ("draft", "delivery"):
                path = folder / "author" / f"{lang}-{stage}.json"
                try:
                    mark = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    continue
                if not isinstance(mark, dict):
                    continue
                count = _counts(mark.get("usage"), model)
                if count:
                    if not mark.get("authorFinished"):
                        count["partial"] = True
                    phases.append(count)
            if phases:
                editions[lang] = _merge(phases)
        if editions:
            counts = _merge(list(editions.values()), partial=len(editions) < len(langs))
            return counts, editions
    # A manual edit can copy the previous plan verbatim. It has no new usage.
    counts = _counts(usage, model) if usage != parent_usage else {}
    if counts:
        counts["partial"] = True
        if len(langs) > 1:
            counts["shared"] = True
    return counts, {lang: counts for lang in langs} if counts else {}
