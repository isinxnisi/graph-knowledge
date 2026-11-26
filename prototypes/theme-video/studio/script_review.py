"""Independent editorial passes for a Japanese-first film, before audio or rendering."""

from itertools import groupby
from urllib.parse import urlsplit

from editor import (JAPANESE_VERSION, VIDEO_EVIDENCE, MaterialRequired, _JAPANESE_PROMPT, _call_writer, _check_draft, _object,
                    _save_json, _text, _writer_request)
from writer_feedback import RevisionNeeded, request_digest, validated_output
from paper_stage_recovery import paper_stage
from wipe_board import ASSET as WIPE_DEMO, DESCRIPTION as WIPE_PICTURE


STRING = {"type": "string"}
MAX_FRESH_FINAL_REVIEWS = 5
LOCAL_REVISION = ("最終確認の指摘が個別の場面・表示・台詞に限られるときは、その箇所と直接つながる箇所だけを直します。"
                  "既に確認が通った要点・場面順・語りは残し、前稿全体に必要な修正を反映した完成稿を返してください。")
SCOPE_MATERIAL = ("選んだ案の理解に欠かせない要点を支える資料が見つからない場合、その要点にはmaterialRequestだけを返し、"
                  "何を確かめるためにどんな原典・図版が必要かを日本語で具体的に書いてください。"
                  "既存の資料で言える範囲に整えられる点や、案に不要な寄り道には追加調査を求めません。")
ILLUSTRATION_BEAT = ("番組が描いた作例の中で起きる動きや、そこから観客が見つけることは、"
                     "illustrationIdだけの要点として返せます。制作室がその図の内容と見どころを補います。"
                     "映画本編で起きること、実際の作者の行動、技法の来歴などを語る要点は、"
                     "meaning、visibleTestと、その主張を確かめられるsourceIdsを返してください。")
SELECTED_ANGLE = ("採用した案で何を見せると約束したか、観終わったときの発見と明示された条件を守ります。"
                  "冒頭の演出や要確認事項の各案は、その約束を果たす別の手立てがあるなら見直せます。"
                  "themeBackgroundは資料庫にあるテーマの紹介です。"
                  "紹介文や前稿に別の逸話があっても、選んだ発見に至るために必要な分だけを採用します。"
                  "依頼が特定の作品の比較を求める場合、それぞれの実例を資料がどこまで特定するかを確かめます。"
                  "一般的な共通点や番組の作例だけで具体例の確認を済ませないでください。"
                  "実際の版・場面・再生時刻、素材利用の許諾は資料で確認できた範囲を扱います。"
                  "許諾の申請窓口は、許諾が得られたことを示しません。")
CHECK_MATERIAL = ("依頼を満たすために必須の根拠や実物が資料に欠けていれば、materialRequestに"
                  "何を確かめるどの資料・映像が必要かを具体的に記し、readyをfalseにしてください。"
                  "このときchecksは空配列にできます。既存資料だけで直せる構成・説明の問題は"
                  "blockingIssueに記し、materialRequestを空文字列にしてください。")

SCOPE_PROMPT = """あなたはPlunodeの企画編集者です。制作依頼と使える根拠を読み、見終わった人の記憶に
残したい瞬間や発見を考えます。questionには、その瞬間を見つけるために編集者が持つ問いを記します。
人物の何気ない動きから入る、同じ景色が途中で違って見える、選択に至った理由を追うなど、題材に合う構成を選びます。
採用済みの動画案があれば、観終わったときの発見を一本の軸にします。元テーマの別の逸話は、
この発見を理解するために必要なものだけを選んでください。演出案を実際に起きた出来事として語るときには、その根拠を確かめます。
最初の絵と音が、この回の第一印象をつくります。そこに何を置き、視線がその先の何に気づくかを考えます。途中で当事者の回想や資料を明かすと、先ほどの絵がどう見えてくるかも考えてください。
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
実際に起きたことと、誰かの見方や作例の境目で迷ったところがあれば、そのまま記してください。台本にない知識で理由を補わず、迷った箇所や
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


def _scope_schema(sources, illustrations=()):
    ids = {"type": "string", "enum": list(sources)}
    beat = _object({"meaning": STRING, "sourceIds": _array(ids), "visibleTest": STRING})
    variants = [beat]
    if illustrations:
        variants.append(_object({"illustrationId": {"type": "string", "enum": list(illustrations)}}))
    variants.append(_object({"materialRequest": STRING}))
    return _object({"question": STRING, "beats": _array({"anyOf": variants}), "outline": STRING})


def _scope(raw, sources, illustrations=()):
    beats = []
    for i, item in enumerate(raw["beats"], 1):
        if "materialRequest" in item:
            need = item["materialRequest"]
            if set(item) != {"materialRequest"} or not isinstance(need, str) or not need.strip():
                raise ValueError(f"要点{i}の素材依頼には、確かめたいことと不足する資料だけを具体的に記してください。")
            raise MaterialRequired("追加資料が必要です。" + " ".join(need.split()))
        illustration = item.get("illustrationId")
        if "illustrationId" in item:
            if set(item) != {"illustrationId"} or illustration not in illustrations:
                raise ValueError(f"要点{i}の作例には使用できるillustrationIdだけを指定してください。実作品の説明には出典が必要です。")
            beats.append({"id": f"b{i}", "illustrationId": illustration, "sourceIds": [],
                          "meaning": "番組の作例で、動く境目の左右に道と星空が同時に見えることに気づく。",
                          "visibleTest": WIPE_PICTURE})
            continue
        ids = item.get("sourceIds")
        if not isinstance(ids, list) or not ids or any(not isinstance(sid, str) or sid not in sources for sid in ids):
            hint = " 自作図だけで確かめる要点なら、illustrationIdだけを返してください。" if illustrations else ""
            raise ValueError(f"企画の要点{i}に対応する公開資料のIDを確認してください。" + hint +
                             " 不可欠な資料が見つからない場合は、その要点にmaterialRequestだけを返してください。")
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
        WIPE_DEMO: WIPE_PICTURE,
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
            placement = f"左に「{heading}」、右に" if heading else ("中央に" if len(cards) == 1 else "左右に")
            ground = "白地" if scene.get("sourceBackground") == "white" else "生成りの紙色"
            picture = f"出典資料。字幕帯より上の背景は{ground}。" + placement + "、".join(
                f"{urlsplit(c['url']).hostname} {c['title']}" for c in cards)
        elif scene["asset"] == "exchange":
            labels = scene["exchange"]
            left, right = labels["left"]["ja"], labels["right"]["ja"]
            picture = (f"番組の説明図。左の「{left}」と右の「{right}」には紙の手。"
                       f"「{labels['toRight']['ja']}」と書かれた紙片が左から右の手へ、"
                       f"「{labels['toLeft']['ja']}」と書かれた紙片が右から左の手へ渡り、受け取った側に残る。")
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


def produce_japanese(snapshot, materials, script_schema, model, effort, folder, progress):
    source_ids = {s["id"] for s in snapshot["sources"]}
    # Only a board the renderer can draw supplies a source-free observation.
    has_demo = WIPE_DEMO in materials["assets"] and WIPE_DEMO in materials.get("illustrations", {})
    illustrations = [WIPE_DEMO] if has_demo else []
    scope_schema = _scope_schema(sorted(source_ids), illustrations)
    records = folder / "editor-stages"
    usage = {}
    has_review_history = any(records.glob("05-check-*.json"))

    def stage(name, label, instructions, inputs, schema, validate):
        request = _writer_request(model, effort, JAPANESE_VERSION, instructions, inputs, schema)
        saved = paper_stage(records, name, request, instructions, inputs, validate, LOCAL_REVISION) if has_review_history else None
        if saved:
            if progress:
                progress(label + "（保存稿を引き継ぎ）")
            value, accepted, cached, stage_usage = saved
        else:
            value, accepted, cached, stage_usage = validated_output(
                name=name, label=label, records=records, request=request, instructions=instructions, inputs=inputs,
                validate=validate, writer=_call_writer, progress=progress)
        for key, count in stage_usage.items():
            usage[key] = usage.get(key, 0) + count
        return value, accepted, cached

    def draft(raw):
        return _check_draft(raw, snapshot, materials["assets"], "ja")

    facts = {key: materials[key] for key in ("theme", "description", "angle", "records", "sources")}
    if materials.get("editorialDirection"):
        facts["editorialDirection"] = materials["editorialDirection"]
    scope_instructions = "\n".join((SCOPE_PROMPT, SELECTED_ANGLE, VIDEO_EVIDENCE, SCOPE_MATERIAL))
    review_picture = "exchangeBoard" in materials
    if review_picture:
        facts["exchangeBoard"] = materials["exchangeBoard"]
        scope_instructions += ("\n冒頭で観客は何に目を留め、その後でその見え方がどう変わるのかを、大筋に描いてください。"
                               "物、記録の文字、人物の間の動きなど、題材に即した瞬間を選びます。"
                               "互いに何を渡したかが要点なら、両方向を裏づける資料を確認し、exchangeBoardの作例も検討できます。")
    if "productionResearch" in materials:
        facts["productionResearch"] = materials["productionResearch"]
        facts["illustrations"] = materials.get("illustrations", {})
        scope_instructions += ("\n追加調査後の再企画です。採用した案の発見に焦点を戻し、そこに不要な別の逸話は省いてください。"
                               "追加資料の言える範囲、未確認の点、使える作図を照合します。説明の作例と特定の実例を区別し、"
                               "調べていない版・時刻・方向や利用許諾を補わないでください。")
    if "previousJapanese" in materials:
        facts["previousJapanese"] = materials["previousJapanese"]
        scope_instructions += ("\n前稿の語りと試写コメントから何が届き、何が足りなかったかを考えます。"
                               "前の場面順を採用する必要はありません。資料、依頼、試写コメントを役割に応じて読んでください。")
    if illustrations:
        facts["illustrations"] = {WIPE_DEMO: WIPE_PICTURE}
        scope_instructions += "\n" + ILLUSTRATION_BEAT
    scope, _, _ = stage("01-scope", "1/5 企画の問い・要点・大筋を検討中", scope_instructions,
                        facts, scope_schema, lambda raw: _scope(raw, source_ids, illustrations))
    initial, _, _ = stage("02-draft", "2/5 大筋から初稿を執筆中", _JAPANESE_PROMPT, {**materials, "scope": scope},
                          script_schema, draft)
    reader_schema = _object({"retelling": STRING, "unclear": STRING})
    def reader(raw):
        return {"retelling": _text(raw["retelling"], 6000, "初見の読解"), "unclear": raw["unclear"].strip()}
    audience, _, _ = stage("03-audience", "3/5 初稿を目的を伏せて読解中", AUDIENCE_PROMPT,
                           _audience_cut(initial), reader_schema, reader)

    revision_schema = _object({"revisedScope": scope_schema, "revisionReason": STRING, "script": script_schema})
    def revision(raw):
        # A writer can report the missing source in either the script or the revised outline.
        need = raw["script"].get("materialRequest")
        if isinstance(need, str) and need.strip():
            draft(raw["script"])
        revised = _scope(raw["revisedScope"], source_ids, illustrations)
        return revised, _text(raw["revisionReason"], 6000, "改稿理由"), draft(raw["script"])

    previous = initial
    feedback = None
    round_no = 0
    fresh_rejections = []
    angle = materials["angle"].strip()
    revision_materials = materials
    audit_request = {"request": materials}
    if angle:
        references = {key: value for key, value in materials.items() if key not in ("angle", "theme", "description")}
        references["themeBackground"] = {"title": materials["theme"], "description": materials["description"]}
        revision_materials = {"request": angle, **references}
        audit_request = {"request": angle, "referenceMaterials": references}
    while True:
        round_no += 1
        inputs = {**revision_materials, "initialScope": scope, "initialDraft": initial, "initialAudience": audience}
        if feedback is not None:
            inputs.update(previousScript=previous, previousScope=revised_scope, finalReview=feedback)
        revision_instructions = _JAPANESE_PROMPT + "\n\n" + REVISION_PROMPT + "\nrevisedScopeについて。" + SCOPE_MATERIAL
        if review_picture:
            revision_instructions += ("\n最初の十数秒を一度観るつもりで、絵や音に観客が目を留める瞬間を探してください。"
                                      "注意書きの読み上げや資料名の列挙が入口を占めるときは、正確さを保って置き場所を見直します。"
                                      "見出しで関係を言い切る前に、観客自身の目でその関係を発見できる演出があるかを検討します。")
        if angle:
            revision_instructions += "\n" + SELECTED_ANGLE
        if illustrations:
            revision_instructions += "\nrevisedScopeについて。" + ILLUSTRATION_BEAT
        revision_stage = f"04-revision-{round_no}"
        if feedback is not None:
            # Replay an already started revision with its original instructions and correction chain.
            old_request = _writer_request(model, effort, JAPANESE_VERSION, revision_instructions, inputs, revision_schema)
            if not (records / f"{revision_stage}-{request_digest(old_request)}.json").is_file():
                revision_instructions += "\n" + LOCAL_REVISION
        revised, script_request, _ = stage(revision_stage, f"4/5 要点を見直して改稿中（{round_no}稿）",
                                            revision_instructions, inputs,
                                            revision_schema, revision)
        revised_scope, reason, previous = revised
        cut = _audience_cut(previous)
        beats = {b["id"]: b for b in revised_scope["beats"]}
        scenes = {s["id"]: s for s in cut["scenes"]}
        shots = {s["id"]: s for s in previous["scenes"]}
        check_item = _object({"beatId": {"type": "string", "enum": list(beats)},
                             "sceneIds": _array({"type": "string", "enum": list(scenes)}),
                             "supported": {"type": "boolean"}, "quote": STRING, "evidence": STRING})
        check_fields = {"ready": {"type": "boolean"}, "blockingIssue": STRING,
                        "materialRequest": STRING, "checks": _array(check_item)}
        if review_picture:
            check_fields["screenMoment"] = _object({
                "sceneIds": _array({"type": "string", "enum": list(scenes)}), "pictureQuote": STRING,
                "discovery": STRING, "revision": STRING})
        check_schema = _object(check_fields)
        def audit(raw):
            need = raw.get("materialRequest", "")
            if not isinstance(need, str):
                raise ValueError("最終確認の素材依頼には必要な資料を書き、不要なら空文字列を指定してください。")
            if need.strip():
                raise MaterialRequired("追加資料が必要です。" + " ".join(need.split()))
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
                    if illustrations:
                        board = beats[c["beatId"]].get("illustrationId")
                        if board and not any(shots[s]["asset"] == board for s in ids):
                            c["supported"] = False
                            c["evidence"] += " 指定した場面に要点の自作図が登場しません。"
                        elif not board and not any(shots[s]["sourceIds"] for s in ids):
                            c["supported"] = False
                            c["evidence"] += " この事実を語る場面に公開資料を指定してください。"
            if review_picture:
                moment = raw.get("screenMoment")
                if not isinstance(moment, dict):
                    raise ValueError("独立確認に、画面で気づける見どころの検討がありません。")
                ids = moment.get("sceneIds")
                if not isinstance(ids, list) or any(not isinstance(s, str) or s not in scenes for s in ids):
                    raise ValueError("見どころの確認には清書稿にある場面を指定してください。")
                quote = _text(moment.get("pictureQuote"), 1600, "画面の描写からの引用", allow_empty=True)
                discovery = _text(moment.get("discovery"), 1600, "画面でたどれる発見", allow_empty=True)
                note = _text(moment.get("revision"), 1600, "見せ方の修正", allow_empty=True)
                if not note and (not discovery or not quote or
                                 not any(quote in scenes[s]["picture"] for s in ids)):
                    note = "画面から発見できる見どころを、指定した場面の絵で確認できませんでした。"
                if note:
                    raw["blockingIssue"] = " ".join(filter(None, [raw["blockingIssue"].strip(), note]))
            raw["ready"] = raw["ready"] and not raw["blockingIssue"].strip() and all(c["supported"] for c in checks)
            if not raw["ready"] and not raw["blockingIssue"].strip() and all(c["supported"] for c in checks):
                raise ValueError("改稿を求める場合は、どこを直す必要があるかをblockingIssueに記してください。")
            return raw
        audit_inputs = {**audit_request, "initialScope": scope, "revisedScope": revised_scope,
                        "cut": cut}
        check_instructions = "\n".join((CHECK_PROMPT, VIDEO_EVIDENCE, CHECK_MATERIAL,
            "読みや予想では、手掛かりと帰属が妥当で、視聴者が確かさの程度を受け取れるかを確認します。"))
        if review_picture:
            audit_inputs["sceneSourceIds"] = {sid: shot["sourceIds"] for sid, shot in shots.items()}
            check_instructions += ("\nscreenMomentで、この回だからこそ観客が自分の目で気づける瞬間を一本を通して確認します。"
                                   "sceneIdsにその場面、pictureQuoteにその場面のpictureから見どころの具体的な一節をそのまま抜き、"
                                   "discoveryに何をたどると何に気づけるかを記します。画面の文字そのものを見比べて発見できる回もあります。"
                                   "資料名や見出しを表示したことだけでは、そこで語られる出来事を見たことにはなりません。"
                                   "語りが全部を説明し、絵からはその発見に至れない場合は、まず使える素材でどう見せ直せるかをrevisionに返してください。"
                                   "相互の受け渡しを描いたときは、左右の当事者・双方の中身・向きがその場面のsceneSourceIdsで支えられるかを照合します。"
                                   "伝わる場合のrevisionは空文字です。映像全体の好みやカードの枚数を基準にしません。")
        if angle:
            check_instructions += "\n" + SELECTED_ANGLE
        if illustrations:
            audit_inputs["sceneSourceIds"] = {sid: shot["sourceIds"] for sid, shot in shots.items()}
            check_instructions += ("\nsceneSourceIdsは各場面が使った公開資料です。出典が空の自作図の場面は、"
                                   "その図で見える動きだけを示せます。そこで特定の作品や作者の事実を語っていれば、"
                                   "その場面に裏付けとなる公開資料を付けるよう指摘し、改稿に戻してください。")
        feedback, _, cached = stage(f"05-check-{round_no}", f"5/5 清書稿を依頼・資料と照合中（{round_no}稿）",
                                    check_instructions, audit_inputs, check_schema, audit)
        if feedback["ready"]:
            if progress:
                progress("5/5 清書稿の照合を保存しました")
            input_sha = _save_json(folder / "editor-input.json", script_request)
            initial_lines = [{"heading": s["ja"]["heading"], "narration": s["ja"]["narration"]}
                             for s in initial["scenes"]]
            previous["editorialReview"] = {"initialScript": initial_lines, "initialScope": scope, "scope": revised_scope,
                                           "audience": audience, "revisionReason": reason, "checks": feedback["checks"],
                                           "rounds": round_no, "reviewedCutSha256": request_digest(cut)}
            if review_picture:
                previous["editorialReview"]["screenMoment"] = feedback["screenMoment"]
            previous["model"] = {"requested": model, "actual": None, "effort": effort, "provider": "codex-cli",
                                 "instructionVersion": JAPANESE_VERSION, "inputSha256": input_sha, "usage": usage}
            return previous
        if cached:
            continue
        failed = [c for c in feedback["checks"] if not c["supported"]]
        unresolved = feedback["blockingIssue"].strip() or " ".join(c["evidence"] for c in failed)
        # Use what the viewer can see/hear and the supporting references, not the writer's change notes.
        cut_key = request_digest([cut, [s["sourceIds"] for s in previous["scenes"]]])
        issue_key = (" ".join(unresolved.split()), tuple(sorted(c["beatId"] for c in failed)))
        if (cut_key, issue_key) in fresh_rejections:
            stop = "自動改稿しても画面と語りに改善が見られず、同じ指摘が残りました。"
        elif len(fresh_rejections) >= 2 and all(key == issue_key for _, key in fresh_rejections[-2:]):
            stop = "稿を変えても、最終確認で同じ指摘が3回続きました。"
        elif len(fresh_rejections) + 1 >= MAX_FRESH_FINAL_REVIEWS:
            stop = f"今回の実行で清書稿を{MAX_FRESH_FINAL_REVIEWS}回照合しましたが、まだ修正が必要です。"
        else:
            fresh_rejections.append((cut_key, issue_key))
            if progress:
                progress(f"{round_no}稿目の指摘を反映して次の稿を自動で作成します。" + unresolved)
            continue
        raise RevisionNeeded(stop + " 残った指摘　" + unresolved)
