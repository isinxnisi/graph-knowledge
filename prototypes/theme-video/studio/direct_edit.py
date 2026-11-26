"""Apply a director's local changes to an existing shot, or borrow artwork across shots."""
from authored_art import DRAWING_GUIDE, _fields, _object, art_schema, layer_schema, validate_art


EDIT_GUIDE = """現在の原画に対して必要な差分だけをchangesに返します。省略した層・線・動き・順番はすべて引き継がれます。
各操作のwhyに、試写のどの指摘にどう効くかを短く書きます。layerは現在の元の層番号、pathはその層の元のパス番号（どちらも先頭0）。
motionは一層のkeysを入れ替えます。recolorは一つのパスのfill、stroke、widthのうち変える値を指定し、維持する値をnullにします。
reshapeは一つのパスのdだけを変更。addPathは指定層の末尾にdrawing（新規パス）を追加、removePathは指定パスを除きます。
addは新しい層drawingを追加。removeは一層を除き、moveは一層の重なり順を移動します。renameで層名name、backgroundで紙の色colorを変更します。
borrowはsourceで指定する別場面のsourceLayerを取り込みます。keysがnullなら元の動きごと引き継ぎ、配列なら新しい配置と動きです。
文字の追従先が同名の層と重複する場合、borrowへas（取り込み後の新しい名前）を指定できます。
add・borrow・moveのbeforeは挿入先の元の層番号。nullは最前面です。元の層の番号は途中で変わりません。
たとえば動きだけを直すなら、{"op":"motion","layer":2,"keys":[{"at":0,"x":150,"y":300,"scale":1,"rotate":0,"opacity":1},{"at":1,"x":310,"y":300,"scale":1,"rotate":0,"opacity":1}],"why":"紙片が札から離れて止まるところを見せる"} の一操作で足ります。"""

MULTI_ART_GUIDE = DRAWING_GUIDE + """
見本として渡された各原画の層を、同じ一枚に組み合わせられます。新たに描く層にはname、paths、keysを指定します。
以前の層を引き継ぐには、{"from":"previousArt","reuseLayer":0,"keys":null} のように参照元のIDと層番号（先頭0）を両方指定します。
fromには一覧にあるIDを使います。nullのkeysは元の配置・動きを引き継ぎ、配列なら同じ形に新たな配置・動きを与えます。
文字が付く層を区別するため、新しい層名をasで指定できます。不要ならasを省きます。"""

_INDEX = {"type": "integer"}
_TEXT = {"type": "string"}
_REMOVED_PATH = object()


def layer_catalog(art):
    return [{"index": index, "name": layer["name"], "paths": len(layer["paths"]), "keys": len(layer["keys"])}
            for index, layer in enumerate(art["layers"])]


def _nullable(schema):
    return {"anyOf": [schema, {"type": "null"}]}


def _sources(references):
    return {"type": "string", "enum": list(references)}


def multi_art_schema(references):
    schema = art_schema()
    if references:
        layers = schema["properties"]["layers"]
        layer = layers["items"]
        borrow = {"from": _sources(references), "reuseLayer": _INDEX, "keys": _nullable(layer["properties"]["keys"])}
        layers["items"] = {"anyOf": [layer, _object(borrow), _object({**borrow, "as": _TEXT})]}
    return schema


def _index(index, length, label):
    if type(index) is not int or not 0 <= index < length:
        raise ValueError(f"{label}は元の一覧の0〜{length - 1}の整数で指定してください。")
    return index


def _borrow(references, source, index, change):
    if not isinstance(source, str) or source not in references:
        raise ValueError("引き継ぐ層の参照元を、今回渡された原画のIDから指定してください。")
    layers = references[source]["layers"]
    layer = layers[_index(index, len(layers), f"{source}の層番号")]
    return dict(layer, name=change.get("as", layer["name"]),
                keys=layer["keys"] if change["keys"] is None else change["keys"])


def validate_multi_art(raw, references):
    _fields(raw, ("background", "layers"), "原画")
    if not isinstance(raw["layers"], list) or not 1 <= len(raw["layers"]) <= 48:
        raise ValueError("一場面の原画は1〜48層で描いてください。")
    layers = []
    for layer in raw["layers"]:
        if isinstance(layer, dict) and ("from" in layer or "reuseLayer" in layer):
            fields = ["from", "reuseLayer", "keys"]
            if "as" in layer:
                fields.append("as")
            _fields(layer, fields, "引き継ぐ層")
            layer = _borrow(references, layer["from"], layer["reuseLayer"], layer)
        layers.append(layer)
    return validate_art({"background": raw["background"], "layers": layers})


def _operations(current, references):
    layer = layer_schema()
    keys = layer["properties"]["keys"]
    path = layer["properties"]["paths"]["items"]
    index = {"type": "integer", "enum": list(range(len(current["layers"])))}
    anchor = _nullable(index)
    specs = {
        "motion": {"layer": index, "keys": keys},
        "recolor": {"layer": index, "path": _INDEX, "fill": _nullable(_TEXT),
                    "stroke": _nullable(_TEXT), "width": _nullable({"type": "number"})},
        "reshape": {"layer": index, "path": _INDEX, "d": _TEXT},
        "addPath": {"layer": index, "drawing": path},
        "removePath": {"layer": index, "path": _INDEX},
        "add": {"before": anchor, "drawing": layer},
        "remove": {"layer": index},
        "move": {"layer": index, "before": anchor},
        "rename": {"layer": index, "name": _TEXT},
        "background": {"color": _TEXT},
    }
    if references:
        specs["borrow"] = {"source": _sources(references), "sourceLayer": _INDEX, "keys": _nullable(keys),
                           "before": anchor}
    return specs


def edit_schema(current, references):
    operations = []
    for kind, fields in _operations(current, references).items():
        operation = {"op": {"type": "string", "enum": [kind]}, "why": _TEXT, **fields}
        operations.append(_object(operation))
        if kind == "borrow":
            operations.append(_object({**operation, "as": _TEXT}))
    return _object({"changes": {"type": "array", "items": {"anyOf": operations}}})


def apply_edit(current, references, raw):
    _fields(raw, ("changes",), "原画の差分")
    if not isinstance(raw["changes"], list) or not 1 <= len(raw["changes"]) <= 96:
        raise ValueError("差分には必要な操作を1〜96件指定してください。")
    specs = _operations(current, references)
    # Original indices remain stable across moves and removals. Copy only containers
    # we change here. Final validation rebuilds value objects without mutating the inputs.
    layers = [dict(layer, paths=list(layer["paths"])) for layer in current["layers"]]
    order = list(range(len(layers)))
    background = current["background"]
    touched = set()
    for change in raw["changes"]:
        kind = change.get("op") if isinstance(change, dict) else None
        if not isinstance(kind, str) or kind not in specs:
            raise ValueError("原画の差分に使える操作と参照元を確認してください。")
        fields = ["op", "why", *specs[kind]]
        if kind == "borrow" and "as" in change:
            fields.append("as")
        _fields(change, fields, f"差分{kind}")
        if not isinstance(change["why"], str) or not 0 < len(change["why"].strip()) <= 400:
            raise ValueError("原画を変える理由を操作ごとに400文字以内で記してください。")
        target = change.get("layer")
        if "layer" in change:
            _index(target, len(current["layers"]), "層番号")
            if target not in order or (kind == "remove" and any(t[0] == target for t in touched)):
                raise ValueError("同じ層を削除する操作と、その層を編集する操作は重ねられません。")
        path = change.get("path")
        if "path" in change:
            _index(path, len(current["layers"][target]["paths"]), "パス番号")
            if layers[target]["paths"][path] is _REMOVED_PATH or (kind == "removePath" and
                    any(t[:2] == (target, path) for t in touched)):
                raise ValueError("削除するパスに別の編集を重ねられません。")
        # Appends can repeat. Competing assignments to the same value are ambiguous.
        token = (target, path, kind)
        if kind not in ("add", "borrow", "addPath") and token in touched:
            raise ValueError("同じ差分を重ねて指定しています。同じ対象・種類の変更をまとめてください。")
        touched.add(token)
        if "before" in change:
            before = change["before"]
            if before is not None:
                _index(before, len(current["layers"]), "挿入先の層番号")
                if before not in order or (kind == "move" and before == target):
                    raise ValueError("削除済みの層や移動対象自身を挿入先に指定できません。")
        if kind == "background":
            background = change["color"]
        elif kind == "motion":
            layers[target]["keys"] = change["keys"]
        elif kind == "rename":
            layers[target]["name"] = change["name"]
        elif kind == "recolor":
            style = {key: change[key] for key in ("fill", "stroke", "width") if change[key] is not None}
            if not style:
                raise ValueError("色・線幅のうち、変える値を一つ以上指定してください。")
            layers[target]["paths"][path] = {**layers[target]["paths"][path], **style}
        elif kind == "reshape":
            layers[target]["paths"][path] = {**layers[target]["paths"][path], "d": change["d"]}
        elif kind == "addPath":
            layers[target]["paths"].append(change["drawing"])
        elif kind == "removePath":
            layers[target]["paths"][path] = _REMOVED_PATH
        elif kind == "remove":
            order.remove(target)
        else:
            if kind == "move":
                order.remove(target)
            else:
                target = len(layers)
                drawing = change["drawing"] if kind == "add" else _borrow(
                    references, change["source"], change["sourceLayer"], change)
                layers.append(drawing)
            order.insert(len(order) if before is None else order.index(before), target)
    result = []
    for index in order:
        layer = layers[index]
        if index < len(current["layers"]):
            layer = dict(layer, paths=[path for path in layer["paths"] if path is not _REMOVED_PATH])
        result.append(layer)
    art = validate_art({"background": background, "layers": result})
    if art == current:
        raise ValueError("差分を適用しても原画は同じです。対象と変更内容を確認してください。")
    return art
