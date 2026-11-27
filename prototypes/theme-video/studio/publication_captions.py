"""Use an existing subtitle file to render a reviewable upload copy, without a model call."""
import os
import subprocess
import tempfile
import threading
from pathlib import Path

from author_files import plain_path, read_text
from case_library import require_active
from direct_production import captions, movie_duration


SCHEMA = """CREATE TABLE IF NOT EXISTS publication_captions (
    case_id TEXT NOT NULL, run_id TEXT NOT NULL, lang TEXT NOT NULL,
    status TEXT NOT NULL, error TEXT,
    PRIMARY KEY(case_id, run_id, lang)
)"""


def ass_time(seconds):
    ticks = round(seconds * 100)
    return f"{ticks // 360000}:{ticks // 6000 % 60:02}:{ticks // 100 % 60:02}.{ticks % 100:02}"


def caption_ass(timings, lines, lang, short):
    # Keep the image area readable, and reserve the right and bottom controls in Shorts.
    width, height, size, left, right, bottom = (720, 1280, 34, 46, 100, 246) if short else (1280, 720, 35, 70, 70, 59)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Yu Gothic UI,{size},&H00FFFFFF,&H00FFFFFF,&H00211A14,&H60211A14,-1,0,0,0,100,100,0,0,1,2.7,1.5,2,{left},{right},{bottom},1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"""
    events = []
    for timing, line in zip(timings, lines, strict=True):
        words = line[lang]["narration"]
        # In ASS, braces and backslashes change rendering rather than show literal SRT text.
        words = words.replace("\\", "＼").replace("{", "｛").replace("}", "｝").replace("\n", r"\N")
        events.append(f"Dialogue: 0,{ass_time(timing['start'])},{ass_time(timing['end'])},Caption,,0,0,0,,{words}")
    return "\n".join([header, *events, ""])


class PublicationCaptions:
    def __init__(self, ledger):
        self.ledger = ledger
        self.wake = threading.Event()
        with ledger.db() as db:
            db.execute(SCHEMA)
            db.execute("UPDATE publication_captions SET status='queued' WHERE status='running'")

    def item(self, case, run, lang):
        path = self.ledger.media(case, run, lang, "captioned.mp4")
        with self.ledger.db() as db:
            row = db.execute("SELECT status,error FROM publication_captions WHERE case_id=? AND run_id=? AND lang=?",
                             (case, run, lang)).fetchone()
        has_subtitles = self.ledger.media(case, run, lang, "subtitles.srt").is_file()
        if row and row["status"] == "ready" and path.is_file():
            return {"status": "ready", "video": f"/media/{case}/{run}/{lang}/captioned.mp4",
                    "hasSubtitles": has_subtitles}
        result = dict(row) if row and row["status"] != "ready" else {"status": "none"}
        return dict(result, hasSubtitles=has_subtitles)

    def submit(self, case, run, lang):
        root = self.ledger.folder
        for name in ("video.mp4", "subtitles.srt"):
            plain_path(root, self.ledger.media(case, run, lang, name))
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            require_active(db, case)
            output_exists = self.ledger.media(case, run, lang, "captioned.mp4").is_file()
            db.execute("""INSERT INTO publication_captions VALUES (?,?,?,'queued',NULL)
                          ON CONFLICT (case_id,run_id,lang) DO UPDATE SET status='queued',error=NULL
                          WHERE status='failed' OR (status='ready' AND NOT ?)""", (case, run, lang, output_exists))
        self.wake.set()
        return self.item(case, run, lang)

    def render(self, case, run, lang):
        root = self.ledger.folder
        source = plain_path(root, self.ledger.media(case, run, lang, "video.mp4"))
        short = bool(self.ledger.case(case)["shortSource"])
        duration = movie_duration(source, short=short)
        text = read_text(root, self.ledger.media(case, run, lang, "subtitles.srt"), 8_000_000)
        cues, lines = captions(text, duration, lang)
        if not cues:
            raise ValueError("この版に描画できるSRT字幕がありません。")
        with tempfile.TemporaryDirectory(prefix=".captions-", dir=source.parent) as work:
            Path(work, "captions.ass").write_text(caption_ass(cues, lines, lang, short), encoding="utf-8")
            result = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-protocol_whitelist", "file", "-f", "mov",
                "-i", str(source), "-map", "0:v:0", "-map", "0:a?", "-vf", "ass=captions.ass",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "2",
                "-c:a", "copy", "-movflags", "+faststart", "captioned.mp4"], cwd=work, capture_output=True, timeout=3600,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if result.returncode:
                raise ValueError("字幕付きの書き出しに失敗しました。制作室のFFmpegのASS描画を確認してください。")
            target = Path(work, "captioned.mp4")
            movie_duration(target, short=short)
            target.replace(source.with_name("captioned.mp4"))
        return "ready", None

    def work_once(self):
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT case_id,run_id,lang FROM publication_captions WHERE status='queued' ORDER BY rowid LIMIT 1").fetchone()
            if not row:
                return False
            db.execute("UPDATE publication_captions SET status='running' WHERE case_id=? AND run_id=? AND lang=?", tuple(row))
        try:
            status, error = self.render(*row)
        except ValueError as exc:
            status, error = "failed", str(exc)
        except (KeyError, OSError, subprocess.SubprocessError):
            status, error = "failed", "MP4・SRT・書き出し環境を確認してください。"
        with self.ledger.db() as db:
            db.execute("UPDATE publication_captions SET status=?,error=? WHERE case_id=? AND run_id=? AND lang=?",
                       (status,error,*row))
        return True

    def run_worker(self):
        while True:
            if not self.work_once():
                self.wake.wait(2)
                self.wake.clear()
