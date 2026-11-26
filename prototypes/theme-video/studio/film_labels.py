"""Typeset text positioned in frame space or printed onto a named moving object."""
import math
import re

from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageStat


LABEL_GUIDE = """資料名、二人のクレジット、物の刻印など、読める文字が発見を支えるときはlabelsに置く。
jaは実際に載せる短い一行。x,yは1280×720画面で文字列の中心、sizeは24〜72px、colorは背景から読める#RRGGBB。
xは64〜1216、yは96〜510。見出しや主役の顔を避け、近い二行や隣の英訳にも十分な余白を取る。
文字が途中で現れる場合はtrackにfrom・until（場面の相対時点0〜1）とlayerを付ける。layerが空文字なら固定位置で表示する。
動く札に印刷する文字は例 {"ja":"開く","track":{"layer":"青い札","from":0.2,"until":0.8}}。この形では札の原点が文字の中心で、40px・下地から選ぶ文字色。札に文字を受ける塗り面を描く。
始終出す札はtrackのlayerだけでよい。札の中心を原点(0,0)として形を描き、同じ名前の原画層のキーで札を配置する。
細かく置くときはx・y・size・colorも指定でき、札つきのx・yは札の原点からの距離。autoや下地に溶け込むtrackの文字色は、下地から読める明暗を選ぶ。
原画には文字を描き込まず、字を置く場所を空ける。不要なら[]。1場面に最大6個。"""

LIMITS = {"x": (64, 1216), "y": (96, 510), "size": (24, 72)}


def labels_schema():
    def obj(fields):
        return {"type": "object", "properties": fields, "required": list(fields), "additionalProperties": False}
    layer = {"layer": {"type": "string"}}
    track = {"anyOf": [obj(layer), obj({**layer, "from": {"type": "number"}, "until": {"type": "number"}})]}
    fields = {"ja": {"type": "string"}, "color": {"type": "string"},
              **{k: {"type": "integer"} for k in LIMITS}}
    return {"type": "array", "items": {"anyOf": [obj(fields), obj({**fields, "track": track}),
                                                obj({"ja": fields["ja"], "track": track})]}}


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
        if not isinstance(label, dict):
            raise ValueError("画面の文字と配置を指定してください。")
        track = label.get("track")
        if "track" in label:
            if not isinstance(track, dict) or set(track) not in ({"layer"}, {"layer", "from", "until"}):
                raise ValueError("trackで対象の層名を指定します。区間を限るときはfromとuntilを両方指定してください。")
            layer = track["layer"]
            if not isinstance(layer, str) or len(layer.strip()) > 120:
                raise ValueError("文字に結び付ける原画の層名を正しく指定してください。")
            start, end = track.get("from", 0), track.get("until", 1)
            if type(start) not in (float, int) or type(end) not in (float, int) or not 0 <= start < end <= 1:
                raise ValueError("文字の表示区間は0以上1以下で、fromより後にuntilを指定してください。")
            track = {"layer": layer.strip(), "from": start, "until": end}
            if not (set(LIMITS) | {"color"}) & label.keys():
                label = {**label, "x": 0 if track["layer"] else 640, "y": 0 if track["layer"] else 300,
                         "size": 40, "color": "auto"}
        if label.get("color") != "auto" and not re.fullmatch(r"#[a-fA-F0-9]{6}", str(label.get("color"))):
            raise ValueError("文字色は#RRGGBBまたはautoで指定してください。")
        limits = {**LIMITS, "x": (-1280, 1280), "y": (-720, 720)} if track and track["layer"] else LIMITS
        for key, (low, high) in limits.items():
            if type(label.get(key)) is not int or not low <= label[key] <= high:
                raise ValueError(f"画面の文字の{key}は{low}〜{high}の整数で指定してください。")
        normalized = {key: label[key] for key in ("color", *LIMITS)}
        if track:
            normalized["track"] = track
        result.append({**normalized, "ja": one_line(label.get("ja"), 48)})
    for i, label in enumerate(result):
        if any(share_row(label, other) and abs(label["x"] - other["x"]) < 64 for other in result[:i]):
            raise ValueError("画面の文字が重なっています。左右または上下に間隔を空けてください。")
    return result


def share_row(label, other):
    a, b = label.get("track", {}), other.get("track", {})
    return (a.get("layer", "") == b.get("layer", "") and max(a.get("from", 0), b.get("from", 0)) < min(a.get("until", 1), b.get("until", 1))
            and abs(label["y"] - other["y"]) < (label["size"] + other["size"]) / 2 + 4)


def visible_at(track, t):
    end = track.get("until", 1)
    return track.get("from", 0) <= t and (t < end or end == 1)


def validate_label_targets(labels, art):
    names = [layer["name"] for layer in art["layers"]]
    for label in labels:
        name = label.get("track", {}).get("layer")
        if name and names.count(name) != 1:
            raise ValueError(f"文字「{label['ja']}」の貼り先として、原画に「{name}」という名前の層を一つ指定してください。")


def physical_labels(scene):
    """Type printed on an object while its position, angle or size is visibly changing."""
    keys_by_name = {layer["name"]: layer["keys"] for layer in scene["art"]["layers"]}
    moving = []
    for label in scene.get("labels", []):
        track = label.get("track", {})
        keys = keys_by_name.get(track.get("layer"), [])
        start, end = track.get("from", 0), track.get("until", 1)
        for left, right in zip(keys, keys[1:]):
            if max(left["at"], start) >= min(right["at"], end) or max(left["opacity"], right["opacity"]) <= 0:
                continue
            if any(left[field] != right[field] for field in ("x", "y", "rotate", "scale")):
                moving.append(label)
                break
    return moving


def translated_labels(original, translations):
    if (not isinstance(translations, list) or len(original) != len(translations)
            or any(not isinstance(item, dict) or item.get("ja") != label["ja"]
                   for item, label in zip(translations, original))):
        raise ValueError("画面の文字は場面ごとに日本語表記と順序を保って英訳してください。")
    return [{**label, "en": one_line(item.get("en"), 84)} for label, item in zip(original, translations)]


def _luminance(rgb):
    r, g, b = (v / 3294.6 if v <= 10 else ((v / 255 + .055) / 1.055) ** 2.4 for v in rgb)
    return .2126 * r + .7152 * g + .0722 * b


def _readable_ink(area, mask, requested, paper, ink):
    if area.mode == "RGBA":
        mask = ImageChops.multiply(mask, area.getchannel("A"))
    if not mask.getbbox():
        return ink
    background = _luminance(ImageStat.Stat(area.convert("RGB"), mask=mask).median)

    def contrast(color):
        foreground = _luminance(ImageColor.getrgb(color))
        return (max(background, foreground) + .05) / (min(background, foreground) + .05)

    if requested != "auto" and contrast(requested) >= 3:
        return requested
    return max((paper, ink), key=contrast)


def prepare_lettering(scene, lang, style):
    """Cache type masks in local coordinates; placement uses the same pose as the painted host."""
    from authored_art import AA, layer_x_extent
    from channel_style import H, INK, PAPER, SERIF, W

    labels = scene.get("labels", [])
    if not labels:
        return {}
    if all("track" not in label and label["color"] != "auto" for label in labels):
        # Approved stills have pixel hashes. Preserve the original type size, glyph placement and alpha compositing.
        lettering = Image.new("RGBA", (W, H))
        pen = ImageDraw.Draw(lettering)
        for label in labels:
            x = label["x"]
            space = min(x, W - x) - 16
            for other in labels:
                if other is not label and share_row(label, other):
                    space = min(space, abs(other["x"] - x) / 2 - 6)
            style.text(pen, x, label["y"], label[lang], label["size"],
                       family=SERIF, anchor="mm", max_width=max(1, int(2 * space)), color=label["color"])
        box = lettering.getbbox()
        if not box:
            return {}
        stamp = lettering.crop(box)
        return {"": lambda board, origin, pose, t, resolution: board.paste(stamp, box[:2], stamp)}
    validate_label_targets(labels, scene["art"])
    groups = {}
    layers = {layer["name"]: layer for layer in scene["art"]["layers"]}
    for label in labels:
        track = label.get("track", {})
        name = track.get("layer", "")
        low, high = layer_x_extent(layers[name]) if name else (0, W)
        x = label["x"]
        margin = 4 if name else 16
        half_width = min(x - low, high - x) - margin if low < x < high else W / 2
        for other in labels:
            if other is not label and share_row(label, other):
                half_width = min(half_width, abs(other["x"] - x) / 2 - 6)
        word = label[lang]
        font = style.font(SERIF, AA * label["size"])
        width = max(1, 2 * AA * half_width)
        if font.getlength(word) > width:
            font = style.font(SERIF, max(1, int(AA * label["size"] * width / font.getlength(word))))
        left, top, right, bottom = font.getbbox(word, anchor="mm")
        ink = Image.new("L", (max(1, right - left), max(1, bottom - top)))
        ImageDraw.Draw(ink).text((-left, -top), word, font=font, fill=255, anchor="mm")
        groups.setdefault(name, []).append((label, ink, left, top))

    def letter_painter(group):
        def paint(surface, origin, pose, t, resolution):
            tx, ty, scale, degrees, _ = pose
            angle = math.radians(degrees)
            c, s = math.cos(angle), math.sin(angle)
            zoom = scale * resolution / AA
            for label, ink, left, top in group:
                track = label.get("track", {})
                if not visible_at(track, t):
                    continue
                cx = (tx + scale * (c * label["x"] - s * label["y"])) * resolution - origin[0]
                cy = (ty + scale * (s * label["x"] + c * label["y"])) * resolution - origin[1]
                corners = [(cx + zoom * (c * u - s * v), cy + zoom * (s * u + c * v))
                           for u in (left, left + ink.width) for v in (top, top + ink.height)]
                xs, ys = zip(*corners)
                x0, y0 = max(0, math.floor(min(xs))), max(0, math.floor(min(ys)))
                x1, y1 = min(surface.width, math.ceil(max(xs))), min(surface.height, math.ceil(max(ys)))
                if x1 <= x0 or y1 <= y0:
                    continue
                # Sample only the visible output rectangle, even when the artwork zooms far in.
                dx, dy = x0 - cx, y0 - cy
                inverse = (c / zoom, s / zoom, (c * dx + s * dy) / zoom - left,
                           -s / zoom, c / zoom, (-s * dx + c * dy) / zoom - top)
                mask = ink.transform((x1 - x0, y1 - y0), Image.Transform.AFFINE, inverse, Image.Resampling.BICUBIC)
                color = label["color"]
                if color == "auto" or track:
                    color = _readable_ink(surface.crop((x0, y0, x1, y1)), mask, color, PAPER, INK)
                surface.paste(color, (x0, y0), mask)
        return paint

    return {name: letter_painter(group) for name, group in groups.items()}
