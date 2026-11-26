"""Reconsider how to deliver the chosen viewing experience with the evidence in this run."""
import json

from editor import _call_writer, _draft_input, _object, _save_json, _text, _visual_materials, _writer_request
from writer_feedback import request_digest


_INSTRUCTIONS = """Plunode制作室の編集者として、採用した企画（angle）と資料調査の残件を読み、
映像の入口から見終えた後の発見まで、視聴者への約束と、そのために考案された個々の手段を見分けてください。
needとresearchRemainingは前工程が求めたものです。それが企画自体に本当に必要か、自分で検討します。
登録済みの知識に加え、今回の動画に限って、出典と発言者を示した証言・批評、確かめられた観察からの
読み解き、条件を示した予想を扱えます。初見の視聴者が誰の見方か、どこからが推測かを映像と語りから理解できるようにします。
「かもしれない」を付けただけの未確認の具体的な場面・数値・意図・因果は、実例や事実として使えません。
番組が作る説明例であることを画面・音で伝える方法も考えます。資料を読めたことと、その画像・映像・音声を使えることは別です。
資料は入力に含まれる範囲を使い、架空の出典や実装されていない絵を利用可能としないでください。
assetsのsourceで画面に置けるのは短い見出しと資料名です。任意の図解や人物画、クレジットの再現を約束しません。
それ以外の絵はillustrationsとboardMaterialsにある具体的な描写を読み、視聴者に届く音・絵を組み立てます。
次のうち一つを選びます。特定の結論を優先する決まりはありません。
revise: 元の導入での体験・中心の問い・最後の発見・明示された条件を満たせる場合。
directionに、実際に何を見聞きして何を発見するか、使う資料と残る限界、変更する演出を具体的に書きます。
alternative: 別の入口や発見なら今の材料で一本が成立するが、元の約束は変わる場合。
視聴者が元案で楽しみにした対象や瞬間に近い案から検討します。同じ対象を別の視点で楽しめるならそれを優先し、
テーマ資料に含まれる別の逸話をたどる案は、近い案が成立しない場合に検討します。
たとえば「二つの作品それぞれの場面で見つける」を「自作の例で仕組みを知る」に置き換える場合が該当します。
titleとbriefに単独で選べる具体的な別案（最初の画面、根拠のある内容、最後の発見）を日本語で書き、
reasonには何が変わるか・なぜ元案が保留されるかを明記します。元案の不採用や変更を代行しません。
wait: 元の約束の核に根拠・使用可能な素材がなく、別案も今ある材料では魅力的に成立しない場合。
reasonには具体的に何が確かめられれば進めるかを書きます。解消済み・不要と判断した要求を列挙しません。
reasonは全結果で必須。sourceIdsにはその判断の支えとなった入力のIDを入れます。未使用の文字列は空にします。"""
_STRING = {"type": "string"}
_SCHEMA = _object({
    "outcome": {"type": "string", "enum": ["revise", "alternative", "wait"]},
    "reason": _STRING, "direction": _STRING, "title": _STRING, "brief": _STRING,
    "sourceIds": {"type": "array", "items": _STRING},
})


def _decision(raw, materials):
    if not isinstance(raw, dict) or raw.get("outcome") not in ("revise", "alternative", "wait"):
        raise ValueError("編集判断の結果を読み取れませんでした。")
    outcome = raw["outcome"]
    ids = raw.get("sourceIds")
    known = {s["id"] for s in materials["sources"]}
    if not isinstance(ids, list) or any(not isinstance(s, str) or s not in known for s in ids):
        raise ValueError("編集判断が参照した資料を特定できませんでした。")
    if outcome != "wait" and not ids:
        raise ValueError("提案で使える根拠が特定されていません。")
    reason = _text(raw.get("reason"), 1200, "編集判断の理由")
    direction = _text(raw.get("direction"), 1800, "改稿の方針", allow_empty=outcome != "revise")
    title = _text(raw.get("title"), 120, "別案の題名", allow_empty=outcome != "alternative")
    brief = _text(raw.get("brief"), 1800, "別案の切り口", allow_empty=outcome != "alternative")
    if (outcome != "revise" and direction) or (outcome != "alternative" and (title or brief)):
        raise ValueError("元案の改稿と別案の提案を区別できませんでした。")
    return {"outcome": outcome, "reason": reason, "direction": direction, "sourceIds": ids,
            "alternative": {"title": title, "brief": brief, "reason": reason} if outcome == "alternative" else None}


def assess(materials, brief, model, effort, folder, need, remaining, progress, language, *, cached_only=False):
    """Return the recorded decision and whether this exact request had already been assessed."""
    payload = _draft_input(materials, brief)
    _visual_materials(materials, brief, language, payload)
    payload.update(need=need, researchRemaining=remaining)
    request = _writer_request(model, effort, "plunode-video-editorial-decision-2", _INSTRUCTIONS, payload, _SCHEMA)
    digest = request_digest(request)
    path = folder / "editorial-decision.json"
    record = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    cached = record.get("inputSha256") == digest
    if cached_only and not cached:
        return None, False
    proposal = folder / "editorial-alternative.json"
    if not cached:
        if progress:
            progress("保存した資料で、元案の見せ方と別案の可能性を検討中")
        raw, usage = _call_writer(request)
        record = {"inputSha256": digest, "instructionVersion": request["instructionVersion"],
                  "model": model, "effort": effort, "need": need, "researchRemaining": remaining,
                  "decision": _decision(raw, materials), "usage": usage}
        _save_json(path, record)
    alternative = record["decision"]["alternative"]
    if alternative:
        _save_json(proposal, alternative)
    else:
        proposal.unlink(missing_ok=True)
    return record, cached
