"""Find sources for a specific production need and check the evidence against the publisher's copy."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

from editor import _call_writer, _draft_input, _object, _run, _writer_request
from pdf_material import windows_pdf_library
from wipe_board import DESCRIPTION as WIPE_PICTURE

_STUDIO = Path(__file__).resolve().parent
_ROOT = _STUDIO.parents[2]
_VERSION = "plunode-video-material-research-2"
_SEARCH = """あなたはPlunode映像制作室の調査担当です。needの何が分かれば制作を再開できるかを特定し、
ウェブ検索を実行し、公開されている原資料の本文を開いてください。すでにある根拠とpreviousの調査を踏まえ、
選ばれた案の導入と観終わった後の発見を優先します。調査中に出た逸話は、この案に必要な場合だけ扱い、
別企画に広げないでください。作品の実際の場面と、技法を伝える番組の作例を区別してください。
以前の候補がすべて照合できなかった場合は、引用不一致や形式などの理由を次の探索に生かしてください。
sourceLeadsは優先して確認する公開URLの手がかりです。内容は未照合なので、原資料を開き、今回の問いに合う引用を確かめてください。
既存資料の公開URLも手がかりに、問いの全部または一部を照らす、由来の追える資料を探します。
当事者の証言、研究、具体的な観察を記した批評や記事も対象です。番組の解釈や仮説に使える場合は、その出発点となる観察を探してください。
資料は今回の映像で扱うために集めます。Plunodeの公開テーマへの登録可否はこの調査の採否条件に含めません。
必要な分だけ最大6件まで、題名、認証不要のHTTPSの原資料URL、該当箇所、原文の連続した短い引用を返します。
noteには、確かめられた内容と、誰のどの観察・発言として紹介できるか、または番組のどんな読みの手掛かりになるかを具体的に書きます。
検索結果の紹介文や要約を原文引用として提出しないでください。裏付けられた年代・版・資料の持ち主と、
映像で画像を利用できる条件を区別します。画像が必要なら、どの実物を使えるか、明示された利用条件があるかを調べます。
HTML、プレーンテキスト、文字を抽出できる2 MB以内の公開PDFの本文を照合できます。PDFは一ページ内の連続した原文を選びます。
スキャン等が原本なら、公開機関の同内容のHTMLも探し、
原本でしか確かめられない点や、対応する画像・利用条件が未確認のときはremainingに記してください。
根拠のない候補は返さず、必要な資料が見つからないときはsourcesを空にして、未確認の点を日本語で返します。"""
_REVIEW = """あなたは映像の資料編集者です。検証済み候補の原文と前後の本文を読み、選ばれた案の導入と発見に照らしてneedがどこまで解消したかを判断します。
quoteは掲載本文との一致を確認した原文です。候補の題名や掲載位置は調査担当の報告です。原文と前後の文脈、
著者の立場・時点と版に照らし、実際に支えられる箇所に限定してください。
候補のproposedUseは調査担当の提案です。引用本文で確かめ直し、採用する候補のindexと脚本に渡す日本語のnoteを返してください。
事実を支える記述、誰が何を述べたかを紹介できる証言・批評、番組が一つの読みを示す手掛かりは、それぞれ語れる範囲が違います。
当てはまるものだけをnoteに具体的に残します。証言や批評は発言者や媒体に帰属させ、番組の解釈や仮説は本文にある観察と推論の境目を示します。
例えば、記事が二作品の編集の似た点を指摘していれば、記事に帰属させて比較を紹介できます。そこから特定場面の時刻や作者の意図まで確定はできません。
「かもしれない」を添えただけの作り話や未確認の前提は採用しません。本文が一部を支えるなら、使える部分とその限界をnoteに書いてください。
写真・実物・音声・模式図の取得や利用条件、実際に描けることは、文献による事実の裏付けとは別々に判断してください。
この調査は動画素材ファイルを取得しません。availableIllustrationは制作側で用意済みの自作例です。脚本ではその動きをそのまま使えます。
実際の映画の場面を示すときは場面の確認が、映画の素材を使うときは利用条件の確認がそれぞれ必要です。
remainingは、その導入と発見を成立させるため、脚本に進む前になお調べる必要がある点です。用意済みの作例を描画する作業や、
使わない映像の利用条件を残件に数えません。省ける細部や語り方で守れる限界はnoteに残し、必要な調査が済んだ場合はremainingを空にします。"""
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
        # Each candidate can need a bounded HTTPS fetch and a separate PDF extraction.
        payload = {"candidates": arguments, "pdfLibrary": windows_pdf_library()}
        raw = _run(_proof_command(), cwd=_ROOT, input=json.dumps(payload, ensure_ascii=False), timeout=500)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("原資料の本文照合を実行できませんでした。Nodeの環境と接続を確認してください。") from exc
    if raw.returncode:
        raise RuntimeError("原資料の本文照合を実行できませんでした。リポジトリのNode・tsxの実行環境を確認してください。")
    results = json.loads(raw.stdout)
    if not isinstance(results, list) or len(results) != len(candidates):
        raise RuntimeError("原資料の本文照合の結果を読み取れませんでした。")
    return results


def research_material(snapshot, brief, issue, model, effort, previous, progress=None, *, leads=()):
    if progress:
        progress("不足している資料を公開原典から調査中")
    production = _draft_input(snapshot, brief)
    for card, source in zip(production["sources"], snapshot["sources"]):
        if source.get("url"):
            card["url"] = source["url"]
    data = {"production": production, "need": issue, "previous": []}
    if leads:
        data["sourceLeads"] = list(leads)
    for entry in reversed((previous or [])[-3:]):
        summary = {key: entry[key][:1200] for key in ("need", "remaining", "error") if entry.get(key)}
        summary["sources"] = [{key: source[key][:600] for key in ("title", "url", "locator", "excerpt", "note") if source.get(key)}
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
        source = {**candidate, "url": result["proof"]["url"], "proof": result["proof"]}
        if result.get("locator"):
            source["locator"] = result["locator"]
        verified.append((source, result["context"]))
    if not verified:
        return {"sources": [], "remaining": " ".join(remaining + rejected) or "原資料の本文から根拠を確認できませんでした。",
                "retrySearch": True, "usage": usage}
    if progress:
        progress("原文が今回の企画を支える範囲を確認中")
    excerpts = [{"index": i, "url": s["url"], "title": s["title"], "locator": s["locator"],
                 "quote": s["excerpt"], "context": context, "proposedUse": s["note"]} for i, (s, context) in enumerate(verified)]
    judgment = _object({"index": {"type": "integer", "enum": list(range(len(excerpts)))}, "note": _STRING})
    schema = _object({"supported": {"type": "array", "items": judgment}, "remaining": _STRING})
    data = {"theme": snapshot["title"], "brief": brief, "need": issue, "candidates": excerpts,
            "searchRemaining": remaining, "unverified": rejected}
    if "exchangeBoard" in production:
        data["exchangeBoard"] = production["exchangeBoard"]
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
