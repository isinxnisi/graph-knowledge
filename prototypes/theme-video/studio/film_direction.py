"""Stage an original Japanese film, look at actual illustrations, and revise the cut."""
import hashlib
import json
from pathlib import Path
import re

from PIL import Image, ImageDraw

from authored_art import ART_GUIDE, art_schema, prepare_art, validate_art
from authored_media import SOUND_GUIDE, prepare_scene, sound_layers_schema, validate_sound_layers
from editor import VIDEO_EVIDENCE, MaterialRequired, _call_writer, _draft_input, _object, _save_json, _text, _writer_request
from film_labels import LABEL_GUIDE, labels_schema, validate_labels
from film_vision import style_reference, view_cut
from speech_reading import validate_readings
from writer_feedback import RevisionNeeded, request_digest, validated_output


VERSION = "plunode-film-direction-2"
MODE = "directed-film-v1"
STRING = {"type": "string"}
NUMBER = {"type": "number"}
SOUND = ("none", "paper", "wind", "tap", "chime", "rustle", "whoosh")
MEDIUM = ("documented", "interpretation", "illustration")
SIGNALS = ("travel", "moving-edge", "shape", "appearance", "framing", "arrangement", "other")
SIGNAL_GUIDE = """観察の種類は、物の位置・向きが変わるtravel、二つの領域を分ける境目が場所を移すmoving-edge、
輪郭や形が変わるshape、色や濃さ・透明度が変わるappearance、画角や視点が変わるframing、
静止した物の配置・重なりで分かるarrangement、そのほかの目に見える特徴otherです。"""

DIRECT = """Plunodeの日本語の一本を任された演出家です。視聴者は題材に初めて出会います。
採用案で約束した発見と運営者自身の明示条件を読み取り、仮の演出案・仮題・場面順は画と音のために編集してください。
原資料の仕草や物の形、配置、音、言葉から、この題材だから見たい場面を探します。
資料から距離を取って可笑しさを作る余地があります。視聴者が自分で気づく時間も作ってください。
一回ごとに原画を描けます。紙の余白と短い四音が迎える導入、根拠を知りたいところでの書誌、
絵だけに明け渡す時間など、何がどこで効くかを選びます。ゴダード回では飛翔の2秒半だけ語りを休み、
ウォークマン回では二人のヘッドホンのコードが小さな一台に集まりました。題材に合う別の構成を発明してください。
storyには初見の問い、事実や読みの結びつき、画から何を発見できるかを各一文で記します。
visualBeatは今回、映像で観客に発見してほしい一番の見せ場を一箇所だけ選びます。sceneNumberはその場面番号です。
witnessに、その発見が本当に見えたと判断できる具体的な形・位置関係を一文で記します。動きで見せる場合は途中の区別できる状態まで指定してください。
signalはその判断に欠かせない観察の種類を一つ。sampleAtは実画で確かめる場面内の相対時点を早い順に三つ選びます（0〜1）。
動きの途中でその特徴がよく見える時点を含めます。静けさや静止した構図の発見も選べます。
styleはこの一本の画材・色・繰り返し登場する形と縮尺を作画者に渡す短い指示です。
pictureには各場面の主役の形、視線の行き先、動きの前後と台詞との関係を具体的に記します。
headingは実際に絵の上に表示する短い日本語一行です。絵だけでよい場面は空です。
narrationは字幕を兼ねる短い話し言葉です。人名・数詞・多義語などはreadingsに実際の字幕部分と読みを指定します。
無言のショットはnarrationを空、silentSecondsに正の秒数、leadSeconds・tailSecondsは0。
発話のあるショットはsilentSecondsを0にし、leadSeconds、tailSecondsは語りの前後の余白を秒で指定します。
soundはこの場面で足す音です。atは場面内の相対時点（0〜1）、gainは相対音量（0〜1）、不要ならnoneです。
語りが短い場面でも絵や音が物語を運べます。映像は観察可能な場面で進め、毎場面の資料名の読み上げは避けます。
referenceSceneは同じ人物や物を前の原画から引き継ぎたいときの場面番号（1から）。参照不要なら0です。
mediumは史料に明記された事実を扱うdocumented、誰かの見立てや予想はinterpretation、番組自作の作例はillustration。
絵は番組の作画です。史実そのものの映像・写真や当事者の発言を再現したものと思われる箇所は語りか見出しで帰属を伝えます。
事実を語る場面にはそれを支えるsourceIdsを付け、追加調査を要する中心的な主張があればmaterialRequestに具体的に記します。
作画者が描ける図を求めるときはpictureで演出します。根拠のない細部は作例の範囲で表現してください。""" + "\n" + SIGNAL_GUIDE + "\n" + VIDEO_EVIDENCE

PAINT = """Plunodeの作画を担当します。添付の実画はチャンネルの空気感を共有する作例です。
参照画の題材を写さず、このショットに必要な対象、道具の形、所作、表情を自分で描いてください。
少ない色と輪郭で一目で何が起きているかを示し、もう一度見ると気づく細部を残します。
人物や物は全体の形から作り、その関係は距離・重なり・視線と動きで見せてください。
見出しと字幕、scene.labelsの文字は別に組版されます。ラベルの指定位置に、その文字が読める空間を残します。
上端のロゴと任意見出し、下端の字幕の空間を空けます。
参照指定のある再登場物は前の姿を保ちます。指摘による描き直しでは問題が現れた形や構図・動きそのものを変えてください。"""

LOOK = """添付した試写用の実画を、初めてこの映像を見る人として左から右、上から下に見てください。
各行のs番号は場面番号、横の三枚A・B・Cはその行に記した時点の絵です。何に見え、何が動き、何と何がどう結び付いたか、
視線が止まったところや、文字が邪魔で読めないところを日本語で答えてください。分からない対象を推測で埋めません。
観察した場面IDを順に一つずつ返してください。聴いていない語りや音は評価に含めません。"""

LOOK_FOCUS = """focusSceneIdの行だけ、主役に実際に見えた特徴をfocusSignalsに挙げます。各項目のtraceには、
A・B・Cのどの絵のどこに何が見えたかを具体的に。途中で何が起きたか分からない場合、両端から想像を補わず、
その時点で見える特徴だけを挙げます。確かめられた種類を各一件、何も読み取れなければ空配列です。""" + "\n" + SIGNAL_GUIDE

DECIDE = """独立した編集者として、採用案の発見・根拠・台詞と、実画だけを見た初見役の報告を照合します。
添付は初見役が見たものと同じ実画です。visualBeatの行では、演出家が約束した見分け方を、途中のコマでの位置・形・重なりと比べてください。
前後で結果が変わっていても、途中の仕組みまで見えたことにはなりません。focusVerdictに、画から判別できた場合clear、
別の見え方だった場合missing、画から区別できない場合unreadableを返します。basisにどのコマのどこで区別したかを具体的に記します。
clearのときは、その動作・関係を独立にとらえた初見役のfocusSignalsの番号（1始まり）をobservationに指定してください。
一致する観察がなければobservationは0にします。その他の行は初見役の報告も使って確認してください。
隣り合う場面や再登場する物は、前の原画を描き直した後も姿・向き・位置のつながりが伝わるかを確かめ、食い違う箇所を指摘します。
主役や動きが伝わったか、題材に必要な前提が自然に届くか、語りで答えを先取りしすぎていないか、
事実・帰属・作例を観客が取り違えないかを確認してください。引用可能な根拠と主張を照らし合わせます。
絵が担うべき見せ場を台詞や見出しで説明し直すだけの稿は差し戻します。絵で見えるべきものが不足したときは
repairsに対象の場面ID、直すべき絵・時間・台詞を具体的に書いてください。targetは実際に原画や動きを
直す必要がある場合picture、実画は通っていて語り・音・間・表記を直す場合editです。静止画三枚では判断できない音について
聴いたように推測せず、台詞と音の配置から確かめられることを扱います。好みだけの微修正は求めません。
全体が届く場合はrepairsを空配列にします。根拠不足で中心の発見を保てない場合はmaterialRequestを返します。"""


def array(item):
    return {"type": "array", "items": item}


def choice(values):
    return {"type": "string", "enum": list(values)}


def shot_schema(ids):
    return _object({
        "picture": STRING, "medium": choice(MEDIUM), "sourceIds": array(choice(ids) if ids else STRING),
        "referenceScene": {"type": "integer"}, "heading": STRING, "narration": STRING,
        "readings": array(_object({"text": STRING, "kana": STRING})),
        "leadSeconds": NUMBER, "tailSeconds": NUMBER, "silentSeconds": NUMBER,
        "sound": _object({"kind": choice(SOUND), "at": NUMBER, "gain": NUMBER}),
        "soundLayers": sound_layers_schema(), "labels": labels_schema(),
    })


def number(value, label, maximum):
    if type(value) not in (int, float) or not 0 <= value <= maximum:
        raise ValueError(f"{label}を0〜{maximum}の数値で指定してください。")
    return value


def material(raw):
    need = _text(raw.get("materialRequest"), 5000, "追加調査", allow_empty=True)
    if need:
        raise MaterialRequired("追加資料が必要です。" + need)


def check_shot(raw, index, ids):
    refs = raw.get("sourceIds")
    medium = raw.get("medium")
    if medium not in MEDIUM or not isinstance(refs, list) or any(not isinstance(s, str) or s not in ids for s in refs):
        raise ValueError(f"場面{index}の表現の根拠と出典IDを確認してください。")
    if medium != "illustration" and not refs:
        raise ValueError(f"場面{index}の事実・見立てを支える資料を指定してください。")
    ref = raw.get("referenceScene")
    if type(ref) is not int or not 0 <= ref < index:
        raise ValueError(f"場面{index}の作画参照に前の場面番号か0を指定してください。")
    heading = _text(raw.get("heading"), 60, "画面の見出し", allow_empty=True)
    narration = _text(raw.get("narration"), 450, "語り", allow_empty=True)
    if not isinstance(raw.get("readings"), list) or (not narration and raw["readings"]):
        raise ValueError(f"場面{index}の読みは表記とかなの配列です。無言の場面では空配列です。")
    readings = validate_readings(narration, raw["readings"]) if narration else []
    timing = {key: number(raw.get(key), key, 60) for key in ("leadSeconds", "tailSeconds", "silentSeconds")}
    if (narration and timing["silentSeconds"]) or (not narration and (
            round(timing["silentSeconds"] * 24) < 1 or timing["leadSeconds"] or timing["tailSeconds"])):
        raise ValueError(f"場面{index}の無言尺は発話がある場合に0、無言の場合は正の秒数で前後の余白を0にします。")
    sound = raw.get("sound")
    if not isinstance(sound, dict) or sound.get("kind") not in SOUND:
        raise ValueError(f"場面{index}の音の種類を指定してください。")
    return {"id": f"s{index}", "asset": "authored", "referenceScene": ref,
            "picture": _text(raw.get("picture"), 4500, "原画の演出"), "medium": medium,
            "sourceIds": list(dict.fromkeys(refs)), "ja": {"heading": heading, "narration": narration, "readings": readings},
            **timing, "soundLayers": validate_sound_layers(raw.get("soundLayers", [])), "labels": validate_labels(raw.get("labels", [])),
            "sound": {"kind": sound["kind"], "at": number(sound.get("at"), "音の位置", 1),
                                "gain": number(sound.get("gain"), "音量", 1)}}


def require_evidence(shots):
    if not any(s["sourceIds"] for s in shots):
        raise ValueError("この一本が伝える発見を支える資料を指定してください。")


def check_direction(raw, ids):
    material(raw)
    rows = raw.get("scenes")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 48 or any(not isinstance(s, dict) for s in rows):
        raise ValueError("一本分の場面を1〜48場面で指定してください。")
    shots = [check_shot(s, i, ids) for i, s in enumerate(rows, 1)]
    require_evidence(shots)
    story = raw.get("story")
    if not isinstance(story, dict):
        raise ValueError("作品の問いと着地、絵の見どころを記してください。")
    beat = raw.get("visualBeat")
    if not isinstance(beat, dict) or type(beat.get("sceneNumber")) is not int or not 1 <= beat["sceneNumber"] <= len(shots):
        raise ValueError("作品の見せ場を実画で確認する場面番号を一つ指定してください。")
    times = beat.get("sampleAt")
    if (not isinstance(times, list) or len(times) != 3 or any(type(t) not in (int, float) for t in times)
            or not 0 <= times[0] < times[1] < times[2] <= 1 or beat.get("signal") not in SIGNALS):
        raise ValueError("見せ場の観察の種類と、0〜1のうち異なる実画の確認時点を早い順に三つ指定してください。")
    return {"titles": {"ja": _text(raw.get("title"), 160, "題名")},
            "style": _text(raw.get("style"), 2400, "作画方針"),
            "story": {k: _text(story.get(k), 2400, k) for k in ("question", "explanation", "visualCheck")},
            "visualBeat": {"sceneId": shots[beat["sceneNumber"] - 1]["id"], "signal": beat["signal"],
                           "sampleAt": times, "witness": _text(beat.get("witness"), 1000, "見せ場で見える形や関係")},
            "scenes": shots}


def check_observations(raw, ids, focus_id=None):
    rows = raw.get("observations")
    if not isinstance(rows, list) or any(not isinstance(s, dict) for s in rows) or [s.get("sceneId") for s in rows] != ids:
        raise ValueError("試写画像の場面番号を順に一つずつ返してください。")
    observed = [{"sceneId": row["sceneId"], "seen": _text(row.get("seen"), 1600, "初見で見えたもの")} for row in rows]
    if focus_id:
        signals = raw.get("focusSignals")
        if (not isinstance(signals, list) or any(not isinstance(s, dict) or s.get("kind") not in SIGNALS for s in signals)
                or len({s["kind"] for s in signals}) != len(signals)):
            raise ValueError("指定された一場面で実際に見えた特徴を種類ごとに一件記してください。何も確かめられない場合は空配列です。")
        observed[ids.index(focus_id)]["focusSignals"] = [
            {"kind": s["kind"], "trace": _text(s.get("trace"), 900, "実画のどこに何が見えたか")} for s in signals]
    return observed


def check_review(raw, ids, beat, signals):
    material(raw)
    rows = raw.get("repairs")
    if not isinstance(rows, list) or any(not isinstance(r, dict) or r.get("sceneId") not in ids for r in rows):
        raise ValueError("指摘がある場合は対象の場面番号を指定してください。")
    if len(set(r["sceneId"] for r in rows)) != len(rows):
        raise ValueError("同じ場面の指摘は一つにまとめてください。")
    if any(r.get("target") not in ("picture", "edit") for r in rows):
        raise ValueError("指摘の修正先にpictureまたはeditを指定してください。")
    repairs = [{"sceneId": r["sceneId"], "target": r["target"],
                "reason": _text(r.get("reason"), 2000, "この場面で直すもの")} for r in rows]
    verdict = raw.get("focusVerdict")
    if not isinstance(verdict, dict) or verdict.get("result") not in ("clear", "missing", "unreadable"):
        raise ValueError("見せ場の実画を確認し、判定結果を指定してください。")
    basis = _text(verdict.get("basis"), 1600, "絵から区別できたこと")
    index = verdict.get("observation")
    if type(index) is not int or not 0 <= index <= len(signals):
        raise ValueError("見せ場の判定に使った初見観察の番号を指定してください。該当する観察がなければ0です。")
    found = signals[index - 1] if index else None
    if (verdict["result"] == "clear" and found and beat["signal"] != "other" and found["kind"] != beat["signal"]
            and any(s["kind"] == beat["signal"] for s in signals)):
        raise ValueError("選んだ観察番号は別の種類の変化を指しています。見せ場の判別に使える観察と実画を照合してください。")
    if verdict["result"] != "clear" or not found or (beat["signal"] != "other" and found["kind"] != beat["signal"]):
        traces = "／".join(s["trace"] for s in signals) or "初見で見分けられた特徴はありません。"
        reason = f"見せ場で観客に見えてほしいこと「{beat['witness']}」。初見の実画観察「{traces}」。編集者の照合「{basis}」。この違いが絵で分かるように描き直してください。"
        repair = next((r for r in repairs if r["sceneId"] == beat["sceneId"]), None)
        if repair is None:
            repairs.append({"sceneId": beat["sceneId"], "target": "picture", "reason": reason})
        else:
            repair.update(target="picture", reason=reason + " " + repair["reason"])
    return {"repairs": repairs, "focusVerdict": {"result": verdict["result"], "basis": basis, "observation": index}}


def evidence_for(facts, ids):
    return {"sources": [s for s in facts["sources"] if s["id"] in ids],
            "records": [{"text": row["text"], "evidence": [e for e in row["evidence"] if e["id"] in ids]}
                        for row in facts["records"] if any(e["id"] in ids for e in row["evidence"])]}


def picture_signature(scene, beat):
    # Fixed type can carry a composition. Changing it cannot repair a physical action.
    focus = beat if scene["id"] == beat["sceneId"] else None
    if focus and focus["signal"] in ("travel", "moving-edge", "shape", "framing"):
        paint = prepare_art(scene["art"])
    else:
        paint = prepare_scene({**scene, "ja": {**scene["ja"], "heading": ""}}, "ja")
    digest = hashlib.sha256()
    times = {0, .25, .5, .75, 1}
    if focus:
        times.update(focus["sampleAt"])
    for pos in sorted(times):
        digest.update(paint(pos).resize((256, 144), Image.Resampling.LANCZOS).tobytes())
    return digest.digest()


def proof_sheet(folder, shots, beat):
    width, height = 432, 243
    sheet = Image.new("RGB", (width * 3, (height + 24) * len(shots)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, shot in enumerate(shots):
        top = i * (height + 24)
        paint = prepare_scene(shot, "ja")
        times = beat["sampleAt"] if shot["id"] == beat["sceneId"] else (0, .5, 1)
        for col, at in enumerate(times):
            draw.text((col * width + 6, top + 3), f"{shot['id']}   {'ABC'[col]}   {at:.1%}", fill="black")
            sheet.paste(paint(at).resize((width, height), Image.Resampling.LANCZOS), (col * width, top + 24))
    return save_sheet(folder, "contact", sheet)


def save_sheet(folder, name, sheet):
    digest = hashlib.sha256(sheet.tobytes()).hexdigest()
    path = folder / (name + "-" + digest + ".jpg")
    if not path.is_file():
        pending = path.with_suffix(".writing")
        sheet.save(pending, format="JPEG", quality=92)
        pending.replace(path)
    return path


def publish_storyboard(folder, pages):
    # A handheld browser can scroll the complete proof in the same order as the film.
    with Image.open(pages[-1]) as last:
        height = (len(pages) - 1) * 4 * (243 + 24) + last.height
        sheet = Image.new("RGB", (last.width, height), "white")
    top = 0
    for page in pages:
        with Image.open(page) as part:
            sheet.paste(part, (0, top))
            top += part.height
    pending = folder / "storyboard.writing"
    sheet.save(pending, format="JPEG", quality=90)
    pending.replace(folder / "storyboard.jpg")


def direct_film(snapshot, brief, model_id, effort, work_dir, progress=None, previous_japanese=None):
    folder = Path(work_dir)
    records = folder / "editor-stages"
    ids = [s["id"] for s in snapshot["sources"]]
    usage = {}

    def stage(name, label, prompt, inputs, schema, validate, image=None):
        if image is not None:
            inputs = {**inputs, "imageSha256": hashlib.sha256(image.read_bytes()).hexdigest()}
        req = _writer_request(model_id, effort, VERSION, prompt, inputs, schema)
        writer = _call_writer if image is None else lambda request: view_cut(request, image)
        value, final_req, cached, counts = validated_output(
            name=name, label=label, records=records, request=req, inputs=inputs, instructions=prompt,
            validate=validate, writer=writer, progress=progress)
        for key, count in counts.items():
            usage[key] = usage.get(key, 0) + count
        return value, final_req, cached

    facts = _draft_input(snapshot, brief)
    facts.pop("exchangeBoard", None)
    if snapshot.get("productionResearch"):
        facts["productionResearch"] = snapshot["productionResearch"]
    if previous_japanese:
        facts["previousJapanese"] = previous_japanese
    schema = _object({"title": STRING, "style": STRING, "materialRequest": STRING,
                      "story": _object(dict.fromkeys(("question", "explanation", "visualCheck"), STRING)),
                      "visualBeat": _object({"sceneNumber": {"type": "integer"}, "signal": choice(SIGNALS),
                                             "witness": STRING, "sampleAt": array(NUMBER)}),
                      "scenes": array(shot_schema(ids))})
    previous_cut = None
    direction_prompt = DIRECT + "\n" + SOUND_GUIDE + "\n" + LABEL_GUIDE
    if previous_japanese:
        direction_prompt += ("\n今回は元版の見直しです。previousJapanese.reviewsで運営者が実際に作品から"
                             "受け取った印象と直したい点を読み、届いたところを生かし、指摘の該当箇所を改善してください。")
        run_id = previous_japanese.get("runId")
        if isinstance(run_id, str) and re.fullmatch(r"[0-9a-f]{32}", run_id):
            original = folder.parent / run_id / "ja" / "contact-sheet.png"
            if original.is_file():
                previous_cut = original
                direction_prompt += " 添付は元版の完成映像から抽出した実画です。"
    plan, req, _ = stage("direction", "原資料から演出・画・語りを構成中", direction_prompt, facts, schema,
                         lambda raw: check_direction(raw, ids), previous_cut)
    direction_hash = _save_json(folder / "editor-input.json", req)
    scenes = plan["scenes"]
    scene_ids = [s["id"] for s in scenes]
    beat = plan["visualBeat"]
    focus_index = scene_ids.index(beat["sceneId"])
    sample = style_reference()

    def paint(scene, feedback=None, previous=None):
        inputs = {"style": plan["style"], "scene": {k: v for k, v in scene.items() if k != "art"},
                  **evidence_for(facts, set(scene["sourceIds"]))}
        if scene["id"] == beat["sceneId"]:
            inputs["visualBeat"] = beat
        visual_refs = []
        if scene["referenceScene"]:
            visual_refs.append(("referenceArt", scenes[scene["referenceScene"] - 1]))
        if feedback:
            inputs["revision"] = feedback
            visual_refs.append(("previousArt", previous))
        reference_image = sample
        reference_art = visual_refs[0][1]["art"] if visual_refs else None
        if visual_refs:
            with Image.open(sample) as guide:
                guide.thumbnail((1000, 640))
                sheet = Image.new("RGB", (1000, guide.height + len(visual_refs) * 310), "white")
                sheet.paste(guide, (0, 0))
                top = guide.height
            for name, ref in visual_refs:
                ImageDraw.Draw(sheet).text((8, top + 2), name, fill="black")
                painter = prepare_scene(ref, "ja")
                for col, at in enumerate((0, 1)):
                    sheet.paste(painter(at).resize((500, 281), Image.Resampling.LANCZOS), (col * 500, top + 23))
                top += 310
                art = ref["art"]
                inputs[name] = art if len(json.dumps(art, ensure_ascii=False)) <= 16000 else [
                    layer["name"] for layer in art["layers"]]
            # Layer indices always refer to exactly one saved original.
            inputs["reusableLayers"] = {"from": visual_refs[0][0],
                                        "artSha256": request_digest(reference_art),
                                        "names": [layer["name"] for layer in reference_art["layers"]]}
            reference_image = save_sheet(records, "art-reference", sheet)
        before = picture_signature(previous, beat) if previous is not None else None
        def check_art(raw):
            art = validate_art(raw, reference_art)
            if before is not None and before == picture_signature({**scene, "art": art}, beat):
                raise ValueError("原画の改稿前後で見える絵と動きが同じです。指摘された箇所を実画に反映してください。")
            return art
        art, _, _ = stage("art-" + scene["id"], scene["id"] + "の原画と動きを制作中",
                          PAINT + "\n" + ART_GUIDE, inputs, art_schema(reference_art),
                          check_art, reference_image)
        scene["art"] = art

    for scene in scenes:
        paint(scene)
    history = []
    fresh_rejections = 0
    while True:
        seen, pages = [], []
        for i in range(0, len(scenes), 4):
            group = scenes[i:i + 4]
            page_ids = [s["id"] for s in group]
            proof = proof_sheet(records, group, beat)
            pages.append(proof)
            focus_id = beat["sceneId"] if beat["sceneId"] in page_ids else None
            fields = {"observations": array(_object({"sceneId": choice(page_ids), "seen": STRING}))}
            blind_inputs = {"sceneIds": page_ids}
            if focus_id:
                fields["focusSignals"] = array(_object({"kind": choice(SIGNALS), "trace": STRING}))
                blind_inputs["focusSceneId"] = focus_id
            observations, _, _ = stage("look-" + page_ids[0], "演出意図を伏せて実画を初見確認中",
                                       LOOK + ("\n" + LOOK_FOCUS if focus_id else ""), blind_inputs, _object(fields),
                                       lambda raw: check_observations(raw, page_ids, focus_id), proof)
            seen.extend(observations)

        directions = [{k: v for k, v in s.items() if k != "art"} for s in scenes]
        used = {sid for s in scenes for sid in s["sourceIds"]}
        review_inputs = {"pass": len(history) + 1, "brief": brief, "story": plan["story"], "visualBeat": beat,
                         "cut": directions, "viewer": seen,
                         **evidence_for(facts, used)}
        signals = seen[focus_index]["focusSignals"]
        review_schema = _object({"materialRequest": STRING, "focusVerdict": _object({
            "result": choice(("clear", "missing", "unreadable")), "basis": STRING, "observation": {"type": "integer"}}), "repairs": array(_object({
            "sceneId": choice(scene_ids), "target": choice(("picture", "edit")), "reason": STRING}))})
        review, _, cached = stage("edit-review", "見せ場の実画・初見の観察・語りを照合中",
                                  DECIDE + "\n" + SIGNAL_GUIDE + "\n" + VIDEO_EVIDENCE, review_inputs, review_schema,
                                  lambda raw: check_review(raw, scene_ids, beat, signals), pages[focus_index // 4])
        repairs = review["repairs"]
        if not repairs:
            publish_storyboard(folder, pages)
            plan.update(themeId=snapshot["themeId"], productionMode=MODE,
                        sources=[s for s in snapshot["sources"] if s["id"] in used],
                        filmReview={"rounds": len(history) + 1, "observations": seen, "focusVerdict": review["focusVerdict"],
                                    "changes": [note for changes in history for note in changes]},
                        model={"requested": model_id, "actual": None, "effort": effort, "provider": "codex-cli",
                               "instructionVersion": VERSION, "inputSha256": direction_hash, "usage": usage})
            return plan
        if not cached:
            fresh_rejections += 1
            if fresh_rejections >= 3:
                raise RevisionNeeded("原画を修正して試写しましたが、予定した発見が届いていません。" +
                                     " ".join(r["sceneId"] + " " + r["reason"] for r in repairs))
        history.append(repairs)
        for repair in sorted(repairs, key=lambda r: scene_ids.index(r["sceneId"])):
            index = scene_ids.index(repair["sceneId"])
            old = scenes[index]
            instructions = (DIRECT + "\n" + SOUND_GUIDE + "\n" + LABEL_GUIDE + "\n初見の観察から該当場面を編集します。根拠と"
                            "作品の発見を保ちます。targetがpictureなら作画者が描き直せる形・動きをpictureに"
                            "明記してください。targetがeditなら原画を再利用し、表記・台詞・間・音を編集します。"
                            "既に観客に届いている箇所と指摘に関係しないlabelsを保ち、絵で見せる約束を台詞の削除で取り下げないでください。")
            update = {"request": brief, "story": plan["story"], "currentScene": directions[index],
                      "viewer": seen[index], "repair": repair["reason"], "target": repair["target"], "pass": len(history),
                      "sceneNumber": index + 1, **evidence_for(facts, used)}
            if old["id"] == beat["sceneId"]:
                update["visualBeat"] = beat
            def check_revision(raw):
                revised = check_shot(raw, index + 1, ids)
                require_evidence([*scenes[:index], revised, *scenes[index + 1:]])
                return revised

            updated, _, _ = stage("revise-" + old["id"], old["id"] + "の演出を修正中", instructions, update,
                                  shot_schema(ids), check_revision)
            if repair["target"] == "picture":
                paint(updated, repair["reason"], old)
            else:
                updated.update(art=old["art"], picture=old["picture"], referenceScene=old["referenceScene"])
            scenes[index] = updated
