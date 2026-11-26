"""Replay work saved before source cards could request a white background."""
from copy import deepcopy
import json

from editor import SOURCE_BACKGROUND_PROMPT, _writer_request
from writer_feedback import request_digest


def paper_stage(records, name, request, instructions, inputs, validate, local_revision):
    """Match the exact earlier request; a final approval must always describe the current cut."""
    if request["instructionVersion"] != "plunode-video-ja-7":
        return None
    if (records / f"{name}-{request_digest(request)}.json").is_file():
        return None
    schema = request["outputSchema"]
    if name == "02-draft" or name.startswith("04-revision-"):
        schema = deepcopy(schema)
        script = schema if name == "02-draft" else schema["properties"]["script"]
        scene = script["properties"]["scenes"]["items"]
        if scene["properties"].get("sourceBackground") != {"enum": [None, "white"], "type": ["string", "null"]}:
            return None
        del scene["properties"]["sourceBackground"]
        scene["required"].remove("sourceBackground")
        instructions = instructions.replace("\n" + SOURCE_BACKGROUND_PROMPT, "", 1).removesuffix("\n" + local_revision)
    elif name == "03-audience" or name.startswith("05-check-"):
        inputs = deepcopy(inputs)
        cut = inputs if name == "03-audience" else inputs["cut"]
        for scene in cut["scenes"]:
            picture = scene["picture"]
            if picture.startswith("出典資料。字幕帯より上の背景は白地。"):
                return None
            paper = "出典資料。字幕帯より上の背景は生成りの紙色。"
            if picture.startswith(paper):
                scene["picture"] = "出典資料。" + picture[len(paper):]
    else:
        return None
    old = _writer_request(request["model"], request["effort"], request["instructionVersion"], instructions, inputs, schema)
    digest = request_digest(old)
    path = records / f"{name}-{digest}.json"
    if not path.is_file():
        return None
    try:
        entry = json.loads(path.read_text(encoding="utf-8"))
        if (entry["request"] != old or entry["inputSha256"] != digest or entry["stage"] != name
                or entry["status"] != "done"):
            return None
        value = validate(entry["result"])
        if name.startswith("05-check-") and value["ready"]:
            return None
        usage = {k: n for k, n in (entry.get("usage") or {}).items() if isinstance(n, int)}
        return value, old, True, usage
    except (AttributeError, KeyError, TypeError, ValueError, OSError):
        return None
