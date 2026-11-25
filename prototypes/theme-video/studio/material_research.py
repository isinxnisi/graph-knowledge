"""Find sources for a specific production need and check the evidence against the publisher's copy."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

from editor import _call_writer, _draft_input, _object, _run, _writer_request
from wipe_board import DESCRIPTION as WIPE_PICTURE

_STUDIO = Path(__file__).resolve().parent
_ROOT = _STUDIO.parents[2]
_VERSION = "plunode-video-material-research-1"
_SEARCH = """あなたはPlunode映像制作室の調査担当です。needの何が分かれば制作を再開できるかを特定し、
ウェブ検索を実行し、公開されている原資料の本文を開いてください。すでにある根拠とpreviousの調査を踏まえ、
選ばれた案の導入と観終わった後の発見を優先します。調査中に出た逸話は、この案に必要な場合だけ扱い、
別企画に広げないでください。作品の実際の場面と、技法を伝える番組の作例を区別してください。
以前の候補がすべて照合できなかった場合は、引用不一致や形式などの理由を次の探索に生かしてください。
既存資料の公開URLも手がかりに、追加で確かめたいことに直接答えるものを選んでください。対象者の発言、開発元、アーカイブ、論文、
データの作成元など、題材に合う由来の追える資料を優先します。必要な分だけ、最大6件を提案できます。
各sourceには題名、認証不要のHTTPSの原資料URL、該当箇所、原文の連続した短い引用、どの点を支えるかを返します。
検索結果の紹介文や要約を原文引用として提出しないでください。裏付けられた年代・版・資料の持ち主と、
映像で画像を利用できる条件を区別します。画像が必要なら、どの実物を使えるか、明示された利用条件があるかを調べます。
現在照合できるのはHTMLとプレーンテキストです。PDF・スキャン等が原本なら、公開機関の同内容のHTMLも探し、
原本でしか確かめられない点や、対応する画像・利用条件が未確認のときはremainingに記してください。
根拠のない候補は返さず、必要な資料が見つからないときはsourcesを空にして、未確認の点を日本語で返します。"""
_REVIEW = """あなたは映像の資料編集者です。検証済み候補の原文と前後の本文を読み、選ばれた案の導入と発見に照らしてneedがどこまで解消したかを判断します。
quoteは掲載本文との一致を確認した原文です。候補の題名や掲載位置は調査担当の報告です。原文と前後の文脈、
著者の立場・時点と版に照らし、実際に支えられる箇所に限定してください。
採用する候補のindexと、何をどのように語れるかを示す日本語のnoteを返してください。推測しかできない項目を採用しないでください。
写真・実物・音声・模式図の取得や利用条件、実際に描けることは、文献による事実の裏付けとは別々に判断してください。
映像や新しい図が要る場合は制作側で必要な実作業をremainingに残してください。この調査は動画素材ファイルを取得しません。
availableIllustrationがあれば、番組が描ける技法の作例として使用できます。特定の映画の場面にその技法がある証拠や、映画素材の利用許諾にはなりません。
未確認の点があればremainingに具体的に書きます。確認済み候補が直接答えられる範囲に限り、残件を空にできます。"""
_STRING = {"type": "string"}
_CANDIDATE = _object(dict.fromkeys(("title", "url", "locator", "excerpt", "note"), _STRING))
_SEARCH_SCHEMA = _object({"sources": {"type": "array", "items": _CANDIDATE}, "remaining": _STRING})
_MAX_CANDIDATES = 6


def _proof_command():
    path = _STUDIO.relative_to(_ROOT).as_posix() + "/verify_material.ts"
    if os.name == "nt" and _ROOT.drive.lower().startswith(("\\\\wsl.localhost\\", "\\\\wsl$\\")):
        # A WSL checkout contains Linux Node dependencies, including the native tsx transformer.
        distro = _ROOT.drive.rsplit("\\", 1)[1]
        directory = "/" + "/".join(_ROOT.parts[1:])
        node = ('if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" --no-use && '
                'nvm use --silent "$(cut -d. -f1 .nvmrc)" >/dev/null || exit 1; fi\n'
                'exec node --import tsx "$1"')
        return ["wsl.exe", "-d", distro, "--cd", directory, "--exec", "bash", "-c", node, "verify-material", path]
    return [shutil.which("node") or "node", "--import", "tsx", path]


def _verify(candidates):
    arguments = [{"url": c["url"], "excerpt": c["excerpt"]} for c in candidates]
    try:
        raw = _run(_proof_command(), cwd=_ROOT, input=json.dumps(arguments, ensure_ascii=False), timeout=160)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("原資料の本文照合を実行できませんでした。Nodeの環境と接続を確認してください。") from exc
    if raw.returncode:
        raise RuntimeError("原資料の本文照合を実行できませんでした。リポジトリのNode・tsxの実行環境を確認してください。")
    results = json.loads(raw.stdout)
    if not isinstance(results, list) or len(results) != len(candidates):
        raise RuntimeError("原資料の本文照合の結果を読み取れませんでした。")
    return results


def research_material(snapshot, brief, issue, model, effort, previous, progress=None):
    if progress:
        progress("不足している資料を公開原典から調査中")
    production = _draft_input(snapshot, brief)
    for card, source in zip(production["sources"], snapshot["sources"]):
        if source.get("url"):
            card["url"] = source["url"]
    data = {"production": production, "need": issue, "previous": []}
    for entry in reversed((previous or [])[-3:]):
        summary = {key: entry[key][:1200] for key in ("need", "remaining", "error") if entry.get(key)}
        summary["sources"] = [{key: source[key][:600] for key in ("title", "url", "excerpt", "note") if source.get(key)}
                              for source in (entry.get("sources") or [])[:_MAX_CANDIDATES]]
        data["previous"].insert(0, summary)
        if len(json.dumps(data, ensure_ascii=False)) > 195_000:
            data["previous"].pop(0)
            break
    request = _writer_request(model, effort, _VERSION, _SEARCH, data, _SEARCH_SCHEMA)
    found, usage = _call_writer(request, research=True)
    candidates = found["sources"][:_MAX_CANDIDATES]
    remaining = [found["remaining"]] if found["remaining"].strip() else []
    usage = dict(usage or {})
    if not candidates:
        return {"sources": [], "remaining": " ".join(remaining) or "必要な根拠を示す公開原資料が見つかりませんでした。", "usage": usage}
    if progress:
        progress("候補の原資料を取得し、引用と本文を照合中")
    verified = []
    rejected = []
    for candidate, result in zip(candidates, _verify(candidates)):
        if "error" in result:
            rejected.append(candidate["title"] + " — " + result["error"])
            continue
        verified.append(({**candidate, "url": result["proof"]["url"], "proof": result["proof"]}, result["context"]))
    if not verified:
        return {"sources": [], "remaining": " ".join(remaining + rejected) or "原資料の本文から根拠を確認できませんでした。", "usage": usage}
    if progress:
        progress("原文が今回の企画を支える範囲を確認中")
    excerpts = [{"index": i, "url": s["url"], "title": s["title"], "locator": s["locator"],
                 "quote": s["excerpt"], "context": context} for i, (s, context) in enumerate(verified)]
    judgment = _object({"index": {"type": "integer", "enum": list(range(len(excerpts)))}, "note": _STRING})
    schema = _object({"supported": {"type": "array", "items": judgment}, "remaining": _STRING})
    data = {"theme": snapshot["title"], "brief": brief, "need": issue, "candidates": excerpts,
            "searchRemaining": remaining, "unverified": rejected}
    if re.search(r"ワイプ|\bwipes?\b", brief, re.IGNORECASE):
        data["availableIllustration"] = WIPE_PICTURE
    review, extra_usage = _call_writer(_writer_request(model, effort, _VERSION, _REVIEW, data, schema))
    for key, value in (extra_usage or {}).items():
        if isinstance(value, int):
            usage[key] = usage.get(key, 0) + value
    sources = []
    used = set()
    for item in review["supported"]:
        index = item["index"]
        if type(index) is not int or not 0 <= index < len(verified) or not item["note"].strip():
            raise ValueError("調査結果の引用と採否の対応を確認できませんでした。")
        if index not in used:
            sources.append({**verified[index][0], "note": item["note"]})
            used.add(index)
    remaining = review["remaining"].strip()
    if not sources and not remaining:
        remaining = "本文に一致した引用のうち、この企画に必要な根拠として採用できるものがありませんでした。"
    return {"sources": sources, "remaining": remaining, "usage": usage}
