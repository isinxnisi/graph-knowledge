"""Render episode-specific vector art and keyframed movement with Pillow."""
from functools import lru_cache
import math
import re

import numpy as np
from PIL import Image, ImageChops, ImageDraw


SIZE = (1280, 720)
AA = 2
SURFACE = tuple(side * AA for side in SIZE)
ART_GUIDE = """原画は1280×720。声に字幕が付く間は下部（y=562以降）を字幕に譲ります。
backgroundは紙色などの#RRGGBB。layersは奥から手前。各層のnameは制作用、画面には出ません。
人物のシルエット、指、道具の縁や特徴的な部品、手前の物と奥の景色などを、重なる面や少数の効く線で描きます。
pathsのdはSVGパスのM L H V Q C Z（小文字の相対座標も可）。曲線、塗り、輪郭、小さな細部を自由に組み合わせます。
パスごとに fill と stroke は #RRGGBB または none、widthは線の太さ。同じdに輪郭を重ねると内側と外側が交互に塗られ、穴を通して後ろの絵が見えます。
referenceArtには以前の原画全体または順に並んだ層名が入ります。同じ人物・物・場所を再び描くときは、
その原画の層番号（先頭は0）で色・シルエット・細部を引き継げます。{"reuseLayer":0,"keys":null} は配置と動きも引継ぎ、
{"reuseLayer":0,"keys":[{"at":0,"x":900,"y":350,"scale":1.4,"rotate":0,"opacity":1}]} は同じ形を別の位置と大きさで見せます。
静物のkeysは[]で画面座標のまま表示。動かすものはその物の中心を(0,0)として描き、keysで画面内に置きます。
キーはat（場面の始め0〜終わり1）、x/y（移動）、scale（1が等倍）、rotate（度、時計回り）、opacity（0〜1）。
キー間は直線補間。静止・速度・方向の変化は、必要な瞬間だけキーを置きます。同じ物の縁や部品は一層にまとめると一緒に動きます。
例：層のpathsが [{"d":"M -48 0 Q 0 42 48 0 Z","fill":"#72928b","stroke":"#273b3a","width":3}] なら小舟の形。
keysを [{"at":0,"x":280,"y":380,"scale":1,"rotate":-3,"opacity":1},{"at":1,"x":610,"y":375,"scale":1,"rotate":2,"opacity":1}] にすると舟が渡ります。
これは記法例です。実際に描くもの・色・動き・視点は題材から選びます。"""

_STRING = {"type": "string"}
_NUMBER = {"type": "number"}
_DEFAULT_POSE = (0.0, 0.0, 1.0, 0.0, 1.0)
_POSE_FIELDS = ("x", "y", "scale", "rotate", "opacity")
_PATH_PART = re.compile(r"\s+|,|[MmLlHhVvQqCcZz]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")
_COLOR = re.compile(r"#[0-9a-fA-F]{6}\Z|#[0-9a-fA-F]{3}\Z")


def _object(fields):
    return {"type": "object", "properties": fields, "required": list(fields), "additionalProperties": False}


def art_schema(reference=None):
    path = _object({"d": _STRING, "fill": _STRING, "stroke": _STRING, "width": _NUMBER})
    key = _object(dict.fromkeys(("at", *_POSE_FIELDS), _NUMBER))
    layer = _object({"name": _STRING, "paths": {"type": "array", "items": path},
                     "keys": {"type": "array", "items": key}})
    if reference:
        reuse = _object({"reuseLayer": {"type": "integer", "enum": list(range(len(reference["layers"])))},
                         "keys": {"anyOf": [layer["properties"]["keys"], {"type": "null"}]}})
        layer = {"anyOf": [layer, reuse]}
    return _object({"background": _STRING, "layers": {"type": "array", "items": layer}})


def _fields(raw, fields, label):
    if not isinstance(raw, dict) or raw.keys() != set(fields):
        raise ValueError(f"{label}の項目を確認してください（{', '.join(fields)}）。")


def _number(value, low, high, label):
    if type(value) not in (float, int) or not low <= value <= high:
        raise ValueError(f"{label}は{low}〜{high}の数値で指定してください。")
    return float(value)


def _color(value, *, transparent=False):
    if transparent and value == "none":
        return value
    if not isinstance(value, str) or not _COLOR.fullmatch(value):
        raise ValueError("原画の色は#RRGGBB、透明な塗りと線はnoneで指定してください。")
    return value.lower()


@lru_cache(maxsize=128)
def _contours(d):
    """Flatten only the supported geometry. Nothing here loads or executes SVG/XML."""
    tokens = []
    pos = 0
    for match in _PATH_PART.finditer(d):
        if match.start() != pos:
            raise ValueError("原画パスの記号を確認してください。使える命令はM L H V Q C Zです。")
        pos = match.end()
        token = match.group()
        if token != "," and not token.isspace():
            tokens.append(token)
    if pos != len(d) or not tokens or tokens[0].upper() != "M":
        raise ValueError("原画パスはMと始点から書いてください。")
    contours, points = [], []
    x = y = 0.0
    command = None
    i = 0
    while i < len(tokens):
        if tokens[i].isalpha():
            command = tokens[i]
            i += 1
        if command is None:
            raise ValueError("原画パスに命令が必要です。")
        op = command.upper()
        if op == "Z":
            if len(points) < 2:
                raise ValueError("閉じるパスには先に線を描いてください。")
            x, y = points[0]
            contours.append((points, True))
            points = []
            command = None
            continue
        arity = {"M": 2, "L": 2, "H": 1, "V": 1, "Q": 4, "C": 6}[op]
        values = tokens[i:i + arity]
        if len(values) < arity or any(v.isalpha() for v in values):
            raise ValueError(f"原画パスの{op}には{arity}個の座標が必要です。")
        i += arity
        coords = [float(v) for v in values]
        if any(not -4096 <= value <= 4096 for value in coords):
            raise ValueError("原画パスの座標は±4096以内で指定してください。")
        if command.islower():
            coords = [v + (y if op == "V" or j % 2 else x) for j, v in enumerate(coords)]
        if any(not -4096 <= value <= 4096 for value in coords):
            raise ValueError("相対移動の後の原画座標が±4096を超えました。")
        if op == "M":
            if len(points) >= 2:
                contours.append((points, False))
            x, y = coords
            points = [(x, y)]
            command = "l" if command.islower() else "L"
            continue
        if not points:
            points = [(x, y)]
        if op in ("C", "Q"):
            knots = [(x, y), *zip(coords[::2], coords[1::2])]
            length = sum(math.dist(a, b) for a, b in zip(knots, knots[1:]))
            steps = max(4, min(48, math.ceil(length / 8)))
            for step in range(1, steps + 1):
                t = step / steps
                s = 1 - t
                weights = (s*s, 2*s*t, t*t) if op == "Q" else (s**3, 3*s*s*t, 3*s*t*t, t**3)
                points.append(tuple(sum(w * knot[k] for w, knot in zip(weights, knots)) for k in (0, 1)))
            x, y = knots[-1]
        else:
            if op == "H":
                x = coords[0]
            elif op == "V":
                y = coords[0]
            else:
                x, y = coords
            points.append((x, y))
    if len(points) >= 2:
        contours.append((points, False))
    if not contours:
        raise ValueError("原画パスに描く線か面を指定してください。")
    # Store 8 bytes per vertex instead of retaining individual Python floats and tuples.
    return tuple((np.asarray(points, dtype=np.float32), closed) for points, closed in contours)


def validate_art(raw, reference=None):
    _fields(raw, ("background", "layers"), "原画")
    background = _color(raw["background"])
    if not isinstance(raw["layers"], list) or not 1 <= len(raw["layers"]) <= 48:
        raise ValueError("一場面の原画は1〜48層で描いてください。")
    layers = []
    total_chars = total_paths = 0
    for layer in raw["layers"]:
        if isinstance(layer, dict) and "reuseLayer" in layer:
            _fields(layer, ("reuseLayer", "keys"), "参照する原画")
            index = layer["reuseLayer"]
            if not reference or type(index) is not int or not 0 <= index < len(reference["layers"]):
                raise ValueError("参照原画にある層の番号を指定してください。先頭は0です。")
            original = reference["layers"][index]
            layer = dict(original, keys=original["keys"] if layer["keys"] is None else layer["keys"])
        _fields(layer, ("name", "paths", "keys"), "原画の層")
        name = layer["name"]
        if not isinstance(name, str) or not 0 < len(name.strip()) <= 120:
            raise ValueError("原画の層に短い名前を付けてください。")
        if not isinstance(layer["paths"], list) or not 1 <= len(layer["paths"]) <= 96:
            raise ValueError(f"層「{name}」のパスは1〜96本で描いてください。")
        paths = []
        for p in layer["paths"]:
            _fields(p, ("d", "fill", "stroke", "width"), "原画パス")
            d = p["d"]
            if not isinstance(d, str) or not 0 < len(d) <= 6000:
                raise ValueError(f"層「{name}」のパスは1本6000文字以内で描いてください。")
            total_paths += 1
            total_chars += len(d)
            if total_paths > 240 or total_chars > 60000:
                raise ValueError("一場面の原画は240パス・パス本文合計6万文字以内で描いてください。")
            try:
                _contours(d)
            except ValueError as exc:
                raise ValueError(f"層「{name}」のパス{len(paths) + 1}。{exc}") from None
            fill, stroke = [_color(p[key], transparent=True) for key in ("fill", "stroke")]
            width = _number(p["width"], 0, 128, "線の太さ")
            if fill == "none" and (stroke == "none" or not width):
                raise ValueError(f"層「{name}」のパスには見える線か塗りを指定してください。")
            paths.append(dict(d=d, fill=fill, stroke=stroke, width=width))
        if not isinstance(layer["keys"], list) or len(layer["keys"]) > 64:
            raise ValueError("層の動きは64キー以内で指定してください。静止には空配列を使えます。")
        keys = []
        for key in layer["keys"]:
            fields = ("at", *_POSE_FIELDS)
            _fields(key, fields, "原画の動き")
            bounds = ((0, 1), (-4096, 4096), (-4096, 4096), (.01, 12), (-3600, 3600), (0, 1))
            normalized = {k: _number(key[k], *limits, k) for k, limits in zip(fields, bounds)}
            if keys and keys[-1]["at"] >= normalized["at"]:
                raise ValueError(f"層「{name}」のキーのatは、小さい順に異なる時刻を指定してください。")
            keys.append(normalized)
        layers.append(dict(name=name.strip(), paths=paths, keys=keys))
    return {"background": background, "layers": layers}


def _pose(keys, t):
    if not keys:
        return _DEFAULT_POSE
    left = keys[0]
    for right in keys[1:]:
        if t < right["at"]:
            amount = max(0, (t - left["at"]) / (right["at"] - left["at"]))
            return tuple(left[k] + amount * (right[k] - left[k]) for k in _POSE_FIELDS)
        left = right
    return tuple(left[k] for k in _POSE_FIELDS)


def _geometry(layer, pose):
    x, y, scale, angle, _ = pose
    cos = math.cos(math.radians(angle)) * scale * AA
    sin = math.sin(math.radians(angle)) * scale * AA
    rotate = np.array(((cos, sin), (-sin, cos)), dtype=np.float32)
    position = np.array((x * AA, y * AA), dtype=np.float32)
    visible = []
    for path in layer["paths"]:
        contours = []
        width = max(1, round(path["width"] * scale * AA)) if path["stroke"] != "none" and path["width"] else 0
        padding = (width + 1) // 2 + 2
        for points, closed in path["geometry"]:
            vertices = np.rint(points @ rotate + position).astype(np.int32)
            low = vertices.min(axis=0) - padding
            high = vertices.max(axis=0) + padding + 1
            box = (max(0, int(low[0])), max(0, int(low[1])), min(SURFACE[0], int(high[0])), min(SURFACE[1], int(high[1])))
            if box[2] > box[0] and box[3] > box[1]:
                contours.append((vertices, closed, box))
        if contours:
            visible.append((path, width, contours, _union_box(c[2] for c in contours)))
    return visible


def _union_box(boxes):
    left, top, right, bottom = zip(*boxes)
    return min(left), min(top), max(right), max(bottom)


def _paint(canvas, layer, t):
    pose = _pose(layer["keys"], t)
    opacity = pose[-1]
    if opacity <= 0:
        return
    visible = _geometry(layer, pose)
    if not visible:
        return
    # Blend a translucent object once in its own box, including overlapping parts.
    if opacity < 1:
        x, y, right, bottom = _union_box(v[3] for v in visible)
        surface = Image.new("RGBA", (right - x, bottom - y))
    else:
        x, y = 0, 0
        surface = canvas
    draw = ImageDraw.Draw(surface)
    for path, width, contours, box in visible:
        if path["fill"] != "none":
            if len(contours) == 1:
                points = contours[0][0]
                if len(points) >= 3:
                    draw.polygon((points - (x, y)).ravel().tolist(), fill=path["fill"])
            else:
                # An inner contour removes ink, so moving rings reveal the actual background.
                left, top, right, bottom = box
                shape = Image.new("1", (right - left, bottom - top))
                for points, _, _ in contours:
                    if len(points) >= 3:
                        subpath = Image.new("1", shape.size)
                        ImageDraw.Draw(subpath).polygon((points - (left, top)).ravel().tolist(), fill=1)
                        shape = ImageChops.logical_xor(shape, subpath)
                surface.paste(path["fill"], (left - x, top - y, right - x, bottom - y), shape)
        if width:
            for points, closed, _ in contours:
                coords = (points - (x, y)).ravel().tolist()
                if closed:
                    coords.extend(coords[:2])
                draw.line(coords, fill=path["stroke"], width=width, joint="curve")
    if surface is not canvas:
        mask = surface.getchannel("A").point(lambda a: round(a * opacity))
        canvas.paste(surface, (x, y), mask)


def prepare_art(art):
    """Prepare stationary backgrounds once. The returned RGB frames may be painted on by callers."""
    art = validate_art(art)
    for layer in art["layers"]:
        for path in layer["paths"]:
            path["geometry"] = _contours(path["d"])
    base = Image.new("RGB", SURFACE, art["background"])
    layers = iter(art["layers"])
    moving = []
    for layer in layers:
        if len(layer["keys"]) > 1:
            moving = [layer, *layers]
            break
        _paint(base, layer, 0)
    if not moving:
        still = base.resize(SIZE, Image.Resampling.LANCZOS)
        return lambda progress: still.copy()

    def frame(progress):
        t = max(0, min(1, progress))
        surface = base.copy()
        for layer in moving:
            _paint(surface, layer, t)
        return surface.resize(SIZE, Image.Resampling.LANCZOS)
    return frame


def art_frame(art, progress):
    return prepare_art(art)(progress)
