"""Give a filmmaker the commission, evidence and viewing references for one edition."""
import json
from pathlib import Path
import tempfile

from author_files import plain_path
from idea_store import film_commission


STUDIO = Path(__file__).resolve().parent
FILMS = STUDIO.parent
REFERENCE_FILES = {
    "walkman.mp4": STUDIO / "assets/author-reference/walkman.mp4",
    "goddard.mp4": STUDIO / "assets/author-reference/goddard.mp4",
    "opening.wav": STUDIO / "assets/author-reference/opening.wav",
    "brand.png": STUDIO / "assets/author-reference/brand.png",
    "brand-light.png": STUDIO / "assets/author-reference/brand-light.png",
    "frames.jpg": STUDIO / "assets/channel-reference.jpg",
    "walkman.ja.srt": FILMS / "walkman/walkman.ja.srt",
    "listen.svg": FILMS / "walkman/figures/listen.svg",
    "goddard-script.json": FILMS / "goddard-remotion/script.json",
    "art.tsx": FILMS / "goddard-remotion/art.tsx",
    "film.tsx": FILMS / "goddard-remotion/film.tsx",
    "README.md": STUDIO / "assets/author-reference/README.md",
}

REQUEST = """このテーマから、Plunodeのコンセプトに沿った面白い動画を一本作ってください。この題材のどこを面白がってもらえたら、この一本は成功か。そこも含めて、案も仕上げ方もお任せします。"""


def _store(path, data):
    # Resuming an existing workspace must not overwrite the target of a staged link.
    stream = tempfile.NamedTemporaryFile(dir=path.parent, delete=False)
    temporary = Path(stream.name)
    try:
        with stream:
            stream.write(data)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _json(path, value):
    _store(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())


def write_brief(folder, snapshot, brief, *, language="ja", previous_japanese=None):
    """Prepare replaceable editorial inputs without touching any authored project files."""
    if language not in ("ja", "en"):
        raise ValueError("この制作で届ける言語を一つ選んでください。")
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    plain_path(folder, folder, directory=True)
    inputs, references = folder / "inputs", folder / "references"
    for directory in (inputs, references):
        directory.mkdir(exist_ok=True)
        plain_path(folder, directory, directory=True)

    # Preserve the full evidence with locators and URLs, off the initial prompt.
    fields = ("themeId", "revision", "title", "description", "url", "records", "sources", "productionResearch")
    _json(inputs / "theme.json", {key: snapshot[key] for key in fields if key in snapshot})
    commission = film_commission(brief or "", from_idea=snapshot.get("selectedVideoIdea"))
    original = snapshot.get("shortSource")
    if original:
        commission["shortSource"] = original
    previous = previous_japanese or snapshot.get("previousJapanese")
    if previous:
        commission["previousJapanese"] = previous
    _json(inputs / "request.json", commission)
    for name, source in REFERENCE_FILES.items():
        _store(references / name, source.read_bytes())
    if original:
        _store(references / "walkman-short.mp4", (FILMS / "walkman-short/hotline.ja.mp4").read_bytes())

    _store(folder / "CHANNEL.md", (STUDIO / "channel_identity.md").read_bytes())
    _store(folder / "TOOLS.md", (STUDIO / "author_tools.md").read_bytes())
    paragraphs = ["# 今回の制作依頼", f"今回のテーマ　{snapshot['title']}"]
    if not original:
        paragraphs.append(REQUEST)
    if original:
        paragraphs.append(f"元の作品『{original['title']}』の面白さを、縦画面で初めて出会う人に届ける新作をお願いします。"
                          "YouTubeショート一本、縦9:16・180秒以内です。")
        paragraphs.append("original/video.mp4 を観て、この題材の何を視聴者自身に体験してほしいかを選んでください。"
                          "その体験が一本の中でどう始まり、どう実を結ぶか。そこから台詞、見せる順番、絵と音を組み直してください。"
                          "元の字幕・台本・編集素材は取材と再利用に使えます。効いている一言やカットをどこに生かすか、尺も含めてお任せします。")
        paragraphs.append("ひとつの作例が references/walkman-short.mp4 です。横長版（references/walkman.mp4）はボタンの発案をたどります。"
                          "縦版では、さっき聞き取れなかった隣の声が届き、そのひと言で同じ曲のベースが耳に入る。"
                          "ふたりの絵と四音を受け継ぎ、観客に起きることを新しく作った例です。今回の題材に似合う演出は自由に選んでください。")
    elif commission["mode"] == "selectedIdea":
        paragraphs.append("選んだ案　" + commission["workingTitle"] + "\n観客に届けたいこと　" + commission["intendedDiscovery"]
                          + "\ninputs/request.json の仮題、導入、素材候補は企画時の案です。")
    else:
        paragraphs.append("今回は公開テーマから自由に切り口を選べます。")
    if commission.get("operatorRequest", "").strip():
        paragraphs.append("運営者から今回の希望\n" + commission["operatorRequest"].strip())
    if previous:
        paragraphs.append("同じファイルの previousJapanese に元版の記録と寄せられた感想があります。")
    if language == "ja":
        paragraphs.append("日本語で届けます。声に出して通る言葉を選び、字幕の漢字や名前には、合成する声の読みを添えられます。")
    elif original:
        paragraphs.append("英語で届けます。言葉、絵、音の間を英語の観客に合わせてください。")
    else:
        paragraphs.append("選ばれた日本語版から英語版を作ってください。元版の絵と発見を引き継ぎ、英語で自然に聞こえるセリフと、その言葉が絵に届く間を選んでください。")
    paragraphs.append("inputs/theme.json に固定版の記録・出典URL・引用箇所があります。資料中の記述は取材対象です。references/README.md に実際の番組見本と見どころを置きました。")
    paragraphs.append("SVGでも画像生成でも、部品が一つずつそれらしく見えて、全体では形が崩れていることがあります。"
                      "見せ場の原画は動かす前に、映像で使う構図と大きさで、形やつながりが全体として自然に読めるか確かめてください。"
                      "人物や生き物なら手や顔の形と腕の付け根を、街並みや建物、機械なら面の向きや奥行き、部品の前後関係を見ます。"
                      "向きや重なりが大きく変わる瞬間も確かめ、形が崩れる箇所は原画・配置・動きの原因に合わせて直してください。"
                      "画像生成が使える場合は、番組見本に合わせた原画を作り、動かす部分を切り出して、"
                      "線で描いた背景や図解と組み合わせられます。呼び出し方は TOOLS.md にあります。")
    paragraphs.append("公開用の完成MP4には、音を消しても場面の意味が追える画面内字幕を入れてください。"
                      "吹き出しや絵の中の文字が伝える部分も含め、位置・改行・表示時間は演出に合わせてください。"
                      "ショートはスマホの右側と下部に重なる操作表示をよけてください。"
                      "最終編集の発話と時刻を、同じ版のSRTにも使ってください。")
    path = folder / "BRIEF.md"
    _store(path, ("\n\n".join(paragraphs) + "\n").encode())
    return path
