"""Literal, scene-local Japanese readings for words that need a pronunciation override."""
import re
import unicodedata

_KATAKANA = {i: i + 0x60 for i in range(ord("ぁ"), ord("ゖ") + 1)}

def _normalized_space(value):
    return " ".join(value.split())


def _matches(text, terms):
    matches = []
    for term in terms:
        start = text.find(term)
        while start != -1:
            matches.append((start, start + len(term), term))
            start = text.find(term, start + 1)
    return sorted(matches)


def validate_readings(narration, value):
    """Return canonical {text, kana} entries. A reading applies to every literal occurrence."""
    if not isinstance(narration, str) or not narration.strip():
        raise ValueError("読みを指定する場面の字幕を入力してください。")
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("読みは表記とかなの組で指定してください。")
    caption = _normalized_space(narration)
    entries = {}
    for row in value:
        if not isinstance(row, dict) or not isinstance(row.get("text"), str) or not isinstance(row.get("kana"), str):
            raise ValueError("各行に字幕の表記と読みを入力してください。")
        term = _normalized_space(row["text"])
        kana = _normalized_space(unicodedata.normalize("NFKC", row["kana"]))
        if not term or term not in caption:
            raise ValueError(f"「{term}」はこの場面の字幕にありません。")
        if re.search(r"[。！？!?]", term):
            raise ValueError("読みを指定する語から文末の句点・疑問符・感嘆符を外してください。")
        if not re.fullmatch(r"[ぁ-ゖァ-ヺー・ ]+", kana) or not re.search(r"[ぁ-ゖァ-ヺ]", kana):
            raise ValueError(f"「{term}」の読みをひらがなかカタカナで入力してください。")
        if term in entries and entries[term] != kana:
            raise ValueError(f"「{term}」の読みが複数あります。読み分ける場合は前後を含めた表記で指定してください。")
        entries[term] = kana
    previous_end, previous_term = 0, ""
    spoken_length = len(caption)
    for start, end, term in _matches(caption, entries):
        if start < previous_end:
            raise ValueError(f"「{previous_term}」と「{term}」の読みの範囲が重なっています。"
                             "指定は場面内の同じ表記すべてに適用されます。前後の語を含めて適用範囲を分けてください。")
        previous_end, previous_term = end, term
        spoken_length += len(entries[term]) - len(term)
    # One caption can contain many occurrences of a short surface form. Bound its expanded audio request.
    if spoken_length > 3200:
        raise ValueError("この場面の読み上げ文が長すぎます。読みの適用範囲を確認してください。")
    return [{"text": term, "kana": kana} for term, kana in entries.items()]


def protected_breaks(text, readings):
    """Indexes within terms where a caption (and therefore a voice cue) must not be split."""
    return {position for start, end, _ in _matches(text, (row["text"] for row in readings))
            for position in range(start + 1, end)}


def apply_readings(caption, readings):
    """Apply to the original visible text in one pass; inserted kana never triggers a second rule."""
    if not readings:
        return caption
    # VOICEVOX can parse the は inside じゅうはち as a particle. Supply the
    # explicit pronunciation as katakana, leaving surrounding Japanese intact.
    terms = {row["text"]: row["kana"].translate(_KATAKANA) for row in readings}
    pattern = "|".join(re.escape(term) for term in terms)
    return re.sub(pattern, lambda match: terms[match.group()], caption)
