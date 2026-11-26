"""Short typeset text the director places inside original artwork."""
import re


LABEL_GUIDE = """資料名、二人のクレジット、物の刻印など、読める文字が発見を支えるときはlabelsに置く。
jaは実際に載せる短い一行。x,yは1280×720画面で文字列の中心、sizeは24〜72px、colorは背景から読める#RRGGBB。
xは64〜1216、yは96〜510。見出しや主役の顔を避け、近い二行や隣の英訳にも十分な余白を取る。
原画には文字を描き込まず、字を置く場所を空ける。不要なら[]。1場面に最大6個。"""

LIMITS = {"x": (64, 1216), "y": (96, 510), "size": (24, 72)}


def labels_schema():
    fields = {"ja": {"type": "string"}, "color": {"type": "string"},
              **{k: {"type": "integer"} for k in LIMITS}}
    return {"type": "array", "items": {"type": "object", "properties": fields,
                                      "required": list(fields), "additionalProperties": False}}


def one_line(value, maximum):
    if (not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum
            or not value.replace("\u3000", " ").replace("\u00a0", " ").isprintable()):
        raise ValueError(f"画面に置く文字は{maximum}文字以内の空でない一行にしてください。")
    return value.strip()


def validate_labels(labels):
    if not isinstance(labels, list) or len(labels) > 6:
        raise ValueError("画面に置く文字は1場面に6個までです。")
    result = []
    for label in labels:
        if not isinstance(label, dict) or not re.fullmatch(r"#[a-fA-F0-9]{6}", str(label.get("color"))):
            raise ValueError("文字色は#RRGGBBで指定してください。")
        for key, (low, high) in LIMITS.items():
            if type(label.get(key)) is not int or not low <= label[key] <= high:
                raise ValueError(f"画面の文字の{key}は{low}〜{high}の整数で指定してください。")
        normalized = {key: label[key] for key in ("color", *LIMITS)}
        result.append({**normalized, "ja": one_line(label.get("ja"), 48)})
    for i, label in enumerate(result):
        if any(same_line(label, other) and abs(label["x"] - other["x"]) < 64 for other in result[:i]):
            raise ValueError("画面の文字が重なっています。左右または上下に間隔を空けてください。")
    return result


def same_line(label, other):
    return abs(label["y"] - other["y"]) < (label["size"] + other["size"]) / 2 + 4


def translated_labels(original, translations):
    if (not isinstance(translations, list) or len(original) != len(translations)
            or any(not isinstance(item, dict) or item.get("ja") != label["ja"]
                   for item, label in zip(translations, original))):
        raise ValueError("画面の文字は場面ごとに日本語表記と順序を保って英訳してください。")
    return [{**label, "en": one_line(item.get("en"), 84)} for label, item in zip(original, translations)]
