"""Independent editorial passes for a Japanese-first film, before audio or rendering."""

from copy import deepcopy
import hashlib
from itertools import groupby
import json
from urllib.parse import urlsplit

from editor import (JAPANESE_VERSION, _JAPANESE_PROMPT, _call_writer, _check_draft, _object,
                    _save_json, _text, _writer_request)


STRING = {"type": "string"}

SCOPE_PROMPT = """あなたはPlunodeの企画編集者です。制作依頼と使える根拠を読み、見終わった人の記憶に
残したい瞬間や発見を考えます。questionには、その瞬間を見つけるために編集者が持つ問いを記します。
人物の何気ない動きから入る、同じ景色が途中で違って見える、選択に至った理由を追うなど、題材に合う構成を選びます。
最初の絵に何を置き、視線がその先の何に気づくかを考えます。ひと呼吸置いて絵が語れる箇所を探してください。
謎かけと解答を語りに入れるかも企画次第です。依頼に特定の出来事とその意図が挙がっている場合は、
その両方が伝わるところまで扱います。途中の見せ場に絞った結果、肝心の発見が消えていないかを考えます。
作り手には自明でも、その場面に初めて出会う人が知らない事情を探します。いつ、何をしようとしていた場面かが
後の選択の意味を左右するときは、必要なところで自然に伝わる絵や台詞を用意します。
beatsは、この一本の理解に欠かせない因果・発見を、必要な数だけ順に示します。各meaningを自然な日本語一文にし、
使う資料IDと、初見の人がどの絵や言葉で確かめられるかを添えます。outlineにはその発見に向かう大筋を記します。
今は素材の在庫や制作方式を知る前の企画段階です。この題材に本当はどんな絵、動作、間、場面転換が必要かを
自由に描いてください。視聴時間や場面数を目標にしません。動画の形式が指定されたときも、説明を削って収める前に構成を見直します。"""

AUDIENCE_PROMPT = """初めてこの動画に出会う人として、日本語で感想を返してください。手元にあるのは
視聴者に順に届く語り・画面の文字・絵の記述です。一度観たつもりで、何が起き、どこで何に気づいたかを、
心に残った具体的な場面も含めてretellingに書いてください。誰かの行動の理由が伝わった場合はそれも記します。
台本にない知識で理由を補わず、迷った箇所や
置き去りの問いをunclearに示してください。迷いがなければ空文字にできます。作者の意図を推測して採点しません。"""

REVISION_PROMPT = """企画から清書までを任された編集者です。依頼と資料を読み直し、初稿で初見の読み手が
実際に何を受け取ったかと見比べてください。元の大筋に固執せず、視聴者に残したい問いと要点そのものを再考し、
必要なら抜けた因果や目的を戻し、順序を変え、不要な枝を外してください。依頼された要点の取り落としを、
編集メモにだけ答えを書くことで解決してはいけません。どの絵のどこをいつ見て分かるかを考え、実際に声に出す
台詞と素材に反映してください。秒数はこのあと実際の音声と絵から分かります。revisedScopeに再考後の要点と大筋、
revisionReasonに残した点・変えた点とその理由を記し、scriptには最後まで読み直した清書稿をすべて返してください。
場面の末尾と次の冒頭の無言は、続けて観ると一つの間です。観客が見つける動き、読み取る文字、次に渡す視線を
考えて通しで間を選びます。前後の説明で同じ発見を言い直しているときは、声を止める場所も含めて編集します。
前の最終確認で指摘があれば、同じ問題が残らないかを見直します。"""

CHECK_PROMPT = """あなたは別の編集者です。制作依頼、出典と当初・改稿後の企画を手元に置き、清書稿を
視聴者が聞ける台詞と見える絵だけから読み直してください。企画にある答えを視聴者が知っているとは仮定しません。
依頼者が知りたい出来事・選択の意図・その結果の取り落とし、資料との矛盾、絵と台詞の食い違いを見ます。
結びに比喩や要約があるとき、その言葉が指す場面を初見の人が具体的に思い出せるか確かめてください。
スコープの方に要点が抜けていても依頼を優先し、blockingIssueに具体的に書いてください。
checksには改稿後の全beatを一つずつ返し、伝わるかをsupported、根拠となる場面をsceneIdsに挙げます。
evidenceにはその場面で見聞きする何からどう理解できるかを説明してください。引用quoteには一つの該当場面の
narrationかpictureから、根拠となる連続した短い部分を句読点も含めそのまま抜き出します。根拠がない場合は
supportedをfalseとし、quoteとsceneIdsは空で構いません。修正が本当に必要ならreadyをfalseにし、理由を
blockingIssueにまとめます。通せる場合はreadyをtrue、blockingIssueを空文字列にしてください。個人的な文体の好みだけで再執筆を要求しないでください。"""


def _array(items):
    return {"type": "array", "items": items}


def _scope_schema(sources):
    ids = {"type": "string", "enum": list(sources)}
    beat = _object({"meaning": STRING, "sourceIds": _array(ids), "visibleTest": STRING})
    return _object({"question": STRING, "beats": _array(beat), "outline": STRING})


def _scope(raw, sources):
    beats = []
    for i, item in enumerate(raw["beats"], 1):
        ids = item["sourceIds"]
        if not ids or not set(ids).issubset(sources):
            raise ValueError("企画の要点に対応する資料がありません。")
        beats.append({"id": f"b{i}", "meaning": _text(item["meaning"], 6000, "要点"),
                      "sourceIds": ids, "visibleTest": _text(item["visibleTest"], 6000, "見聞きする手掛かり")})
    if not beats:
        raise ValueError("企画に伝える要点がありません。")
    return {"question": _text(raw["question"], 6000, "今回の問い"), "beats": beats,
            "outline": _text(raw["outline"], 6000, "大筋")}


def _audience_cut(plan):
    """Describe only the rendered board and the heard line. Private scene headings rarely appear on Webb boards."""
    scenes = []
    identified = any(s["asset"] == "webb-tilt" for s in plan["scenes"])
    pictures = {
        "webb-sky": ("「どの鏡が映した光？」" if identified else "「星は、いくつ？」") + " 大きな黒い写真に光点が散らばる。",
        "webb-mirror": "「ウェッブの主鏡」「18枚」「どれも、同じ星を見る。」金色の六角形の鏡が並ぶ。中央は空いている。",
        "webb-tilt": "「鏡と像を見分ける模式図」。左のB3という鏡が傾くと、右の多数の点のうち一点が動く。最後にその点にB3と出る。",
        "webb-identify": ("「光のそばの小さな文字」" if identified else "「この鏡の光は、どこに？」")
                         + " 黒い観測写真の右下の点に輪。引き出し線の先に拡大写真が現れ、その光の脇にB3とある。",
        "webb-map": "「鏡の並び」「星の像の並び」。左は金色の主鏡の図、右は六角形状の点の観測画像。左の右上の鏡から右の写真の右上の点へ線が届き、B3と印が出る。",
        "webb-return": ("「ひとつの点に、一枚の鏡。」" if identified else "「見ていた星は、ひとつ。」")
                       + " 散らばった点の観測写真が戻る。右下の一点に輪、次にほかの点にも輪が現れ、やがて消える。",
        "webb-array": "「なぜ、六角形に？」大きな観測写真に、十八個の離れた光の点が六角形状に並んでいる。",
        "webb-layout": "左「主鏡の並び」の図、右「星の像の並び」の観測写真。初めに全体を並べ、左右それぞれの右上に同時に印がつき、同じ符号B3が現れる。",
        "webb-focus": "「像の変化の模式図」。左「主鏡の並び」の十八枚の図、右「星の像の並び」の十八個のぼんやりした点の図。右上の点だけ、その場でにじみが小さくなる。左の鏡はしばらく同じまま。そのあとで左の右上の鏡が色づき、左右にB3と出る。",
    }
    source_by_id = {s["id"]: s for s in plan["sources"]}
    for scene in plan["scenes"]:
        if scene["asset"] == "source":
            cards = [source_by_id[k] for k in scene["sourceIds"][:2]]
            heading = scene["ja"]["heading"]
            picture = "出典資料。" + (f"「{heading}」。" if heading else "") + "、".join(
                f"{urlsplit(c['url']).hostname} {c['title']}" for c in cards)
        else:
            if scene["asset"] not in pictures:
                raise ValueError("初見で読める画面記述がない素材です。" + scene["asset"])
            picture = pictures[scene["asset"]]
        view = {"id": scene["id"], "narration": scene["ja"]["narration"], "picture": picture}
        for key, caption in (("beforeVoice", "beforeVoiceSeconds"), ("afterVoice", "afterVoiceSeconds")):
            seconds = scene.get("visualTiming", {}).get(key)
            if seconds is not None:
                view[caption] = seconds
        scenes.append(view)
    # The renderer advances a single animation across consecutive scenes on the same board.
    # They share one reveal. Before synthesis its exact position among the lines is unknown.
    for asset, group in groupby(enumerate(plan["scenes"]), key=lambda row: row[1]["asset"]):
        indexes = [i for i, _ in group]
        if asset.startswith("webb-") and len(indexes) > 1:
            first, last = scenes[indexes[0]], scenes[indexes[-1]]
            first["picture"] += f" この絵と動きは{first['id']}から{last['id']}までを通して一度だけ続く。"
            for i in indexes[1:]:
                scenes[i]["picture"] = f"{first['id']}から続く画面。場面の境で動きは最初に戻らない。"
    return {"scenes": scenes}


def _digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode()).hexdigest()


def produce_japanese(snapshot, materials, script_schema, model, effort, folder, progress):
    source_ids = {s["id"] for s in snapshot["sources"]}
    scope_schema = _scope_schema(sorted(source_ids))
    records = folder / "editor-stages"
    records.mkdir(exist_ok=True)
    usage = {}

    def stage(name, label, instructions, inputs, schema, validate):
        if progress:
            progress(label)
        request = _writer_request(model, effort, JAPANESE_VERSION, instructions, inputs, schema)
        digest = _digest(request)
        path = records / f"{name}-{digest}.json"
        entry = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        cached = entry.get("status") == "done" and entry.get("request") == request
        if not cached:
            entry = {"stage": name, "request": request, "status": "running", "inputSha256": digest}
            _save_json(path, entry)
            try:
                entry["result"], entry["usage"] = _call_writer(request)
                value = validate(deepcopy(entry["result"]))
            except Exception as exc:
                entry.update(status="failed", error=str(exc))
                _save_json(path, entry)
                raise
            entry["status"] = "done"
            _save_json(path, entry)
        else:
            value = validate(entry["result"])
        for key, count in (entry.get("usage") or {}).items():
            if isinstance(count, int):
                usage[key] = usage.get(key, 0) + count
        return value, request, cached

    def draft(raw):
        return _check_draft(raw, snapshot, materials["assets"], "ja")

    facts = {key: materials[key] for key in ("theme", "description", "angle", "records", "sources")}
    scope_instructions = SCOPE_PROMPT
    if "previousJapanese" in materials:
        facts["previousJapanese"] = materials["previousJapanese"]
        scope_instructions += ("\n前稿の語りと試写コメントから何が届き、何が足りなかったかを考えます。"
                               "前の場面順を採用する必要はありません。資料、依頼、試写コメントを役割に応じて読んでください。")
    scope, _, _ = stage("01-scope", "1/5 企画の問い・要点・大筋を検討中", scope_instructions,
                        facts, scope_schema, lambda raw: _scope(raw, source_ids))
    initial, _, _ = stage("02-draft", "2/5 大筋から初稿を執筆中", _JAPANESE_PROMPT, {**materials, "scope": scope},
                          script_schema, draft)
    reader_schema = _object({"retelling": STRING, "unclear": STRING})
    def reader(raw):
        return {"retelling": _text(raw["retelling"], 6000, "初見の読解"), "unclear": raw["unclear"].strip()}
    audience, _, _ = stage("03-audience", "3/5 初稿を目的を伏せて読解中", AUDIENCE_PROMPT,
                           _audience_cut(initial), reader_schema, reader)

    revision_schema = _object({"revisedScope": scope_schema, "revisionReason": STRING, "script": script_schema})
    def revision(raw):
        script = draft(raw["script"])
        return _scope(raw["revisedScope"], source_ids), _text(raw["revisionReason"], 6000, "改稿理由"), script

    previous = initial
    feedback = None
    round_no = 0
    fresh_failures = 0
    while fresh_failures < 2:
        round_no += 1
        inputs = {**materials, "initialScope": scope, "initialDraft": initial, "initialAudience": audience}
        if feedback is not None:
            inputs.update(previousScript=previous, previousScope=revised_scope, finalReview=feedback)
        revised, script_request, _ = stage(f"04-revision-{round_no}", f"4/5 要点を見直して改稿中（{round_no}稿）",
                                            _JAPANESE_PROMPT + "\n\n" + REVISION_PROMPT, inputs,
                                            revision_schema, revision)
        revised_scope, reason, previous = revised
        cut = _audience_cut(previous)
        beats = [b["id"] for b in revised_scope["beats"]]
        scenes = {s["id"]: s for s in cut["scenes"]}
        check_item = _object({"beatId": {"type": "string", "enum": beats},
                             "sceneIds": _array({"type": "string", "enum": list(scenes)}),
                             "supported": {"type": "boolean"}, "quote": STRING, "evidence": STRING})
        check_schema = _object({"ready": {"type": "boolean"}, "blockingIssue": STRING, "checks": _array(check_item)})
        def audit(raw):
            checks = raw["checks"]
            if sorted(c["beatId"] for c in checks) != sorted(beats):
                raise ValueError("最終確認に全要点の照合結果がそろっていません。")
            for c in checks:
                ids = c["sceneIds"]
                c["evidence"] = _text(c["evidence"], 6000, "最終確認の根拠")
                if not set(ids).issubset(scenes):
                    raise ValueError("最終確認が清書稿にない場面を参照しています。")
                if c["supported"]:
                    quote = c["quote"].strip().strip("「」")
                    if not quote or not any(quote in scenes[s][k] for s in ids for k in ("narration", "picture")):
                        c["supported"] = False
                        c["evidence"] += " 記載された引用を清書稿の該当場面で確認できませんでした。"
            raw["ready"] = raw["ready"] and not raw["blockingIssue"].strip() and all(c["supported"] for c in checks)
            return raw
        audit_inputs = {"request": materials, "initialScope": scope, "revisedScope": revised_scope,
                        "cut": cut}
        feedback, _, cached = stage(f"05-check-{round_no}", f"5/5 清書稿を依頼・資料と照合中（{round_no}稿）",
                                    CHECK_PROMPT, audit_inputs, check_schema, audit)
        if feedback["ready"]:
            if progress:
                progress("5/5 清書稿の照合を保存しました")
            input_sha = _save_json(folder / "editor-input.json", script_request)
            initial_lines = [{"heading": s["ja"]["heading"], "narration": s["ja"]["narration"]}
                             for s in initial["scenes"]]
            previous["editorialReview"] = {"initialScript": initial_lines, "initialScope": scope, "scope": revised_scope,
                                           "audience": audience, "revisionReason": reason, "checks": feedback["checks"],
                                           "rounds": round_no, "reviewedCutSha256": _digest(cut)}
            previous["model"] = {"requested": model, "actual": None, "effort": effort, "provider": "codex-cli",
                                 "instructionVersion": JAPANESE_VERSION, "inputSha256": input_sha, "usage": usage}
            return previous
        if not cached:
            fresh_failures += 1
    unresolved = feedback["blockingIssue"] or " ".join(c["evidence"] for c in feedback["checks"] if not c["supported"])
    raise ValueError("清書稿の再確認で改稿が必要です。再開すると指摘を引き継ぎます。" + unresolved)
