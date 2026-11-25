"""Local production cases, recoverable runs and independent edition selections."""
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import re
import sqlite3
import threading
import uuid
from urllib.parse import urlencode

import idea_store

LANGS = ("ja", "en")
JOB_LABELS = {"queued": "待機中", "running": "生成中", "failed": "失敗", "interrupted": "中断", "script_ready": "台本確認"}
REFERENCE = "walkman-hot-line"
ROOT = Path(__file__).resolve().parent
PILOT = ROOT.parent / "walkman"


class Paused(Exception):
    pass


def packed(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def clock():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def required(data, key, limit=500):
    value = data.get(key)
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= limit:
        raise ValueError(f"{key} の値を確認してください。")
    return value.strip()


def theme_url(theme, revision):
    return "https://plunode.net/?" + urlencode({"ktheme": theme, "krev": revision})


def edition_state(status, ready, adopted, rework=False):
    if ready:
        if rework:
            return "要修正"
        return "採用済み" if adopted else "確認待ち"
    return JOB_LABELS.get(status, "未生成")


def reference_case():
    info = json.loads((PILOT / "reference.json").read_text(encoding="utf-8"))
    theme = info["theme"]
    plan = {"themeId": theme["id"], "titles": {}, "sources": [], "scenes": []}
    for n, source in enumerate(info["sources"], 1):
        plan["sources"].append({"id": f"source{n}", "title": source["use"], "url": source["url"]})
    editions = {}
    for lang in LANGS:
        ed = info["editions"][lang]
        cues = json.loads((PILOT / ed["edit"]).read_text(encoding="utf-8"))
        subs = (PILOT / ed["subtitles"]).read_text(encoding="utf-8").strip().split("\n\n")
        timings = []
        for n, (cue, subtitle) in enumerate(zip(cues, subs), 1):
            sid = f"s{n}"
            times = []
            for stamp in subtitle.splitlines()[1].split(" --> "):
                h, m, s, ms = map(int, re.split("[:,]", stamp))
                times.append(h * 3600 + m * 60 + s + ms / 1000)
            timings.append({"id": sid, "start": times[0], "end": times[1]})
            if lang == "ja":
                plan["scenes"].append({"id": sid, "asset": cue["shot"], "sourceIds": []})
            notes = [{k: obs[k] for k in ("basis", "note")} for obs in ed["observations"] if n in obs["cues"]]
            plan["scenes"][n - 1][lang] = {"heading": "", "narration": cue["caption"].replace("\n", " "),
                                         "reviewNotes": notes}
        plan["titles"][lang] = ed["title"]
        prefix = f"/media/{REFERENCE}/reference/{lang}/"
        editions[lang] = {"video": prefix + "video.mp4", "subtitles": prefix + "subtitles.srt",
                          "timings": timings, "accepted": False}
    timestamp = "2026-11-24T00:00:00+09:00"
    return {"id": REFERENCE, "title": plan["titles"]["ja"], "brief": info["question"], "themeId": theme["id"],
            "themeTitle": theme["title"], "themeUrl": theme["url"], "revision": theme["revision"],
            "updated": timestamp, "reference": True,
            "states": dict.fromkeys(LANGS, "見本"), "accepted": {}, "runs": [{"id": "reference", "parent": None,
            "status": "done", "model": "制作時の記録なし", "reason": "", "progress": "品質見本",
            "created": timestamp, "langs": list(LANGS), "error": None, "editions": editions, "plan": plan}]}


class Ledger:
    def __init__(self, folder):
        self.folder = Path(folder).resolve()
        self.folder.mkdir(parents=True, exist_ok=True)
        self.file = self.folder / "studio.sqlite3"
        self.wake = threading.Event()
        self.reference = reference_case()
        with self.db() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS cases(
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, brief TEXT NOT NULL,
                    snapshot TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS runs(
                    id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id),
                    parent TEXT REFERENCES runs(id), model TEXT NOT NULL, langs TEXT NOT NULL,
                    reason TEXT NOT NULL, status TEXT NOT NULL, progress TEXT NOT NULL,
                    created TEXT NOT NULL, plan TEXT, editions TEXT NOT NULL DEFAULT '{}', error TEXT,
                    pause_requested INTEGER NOT NULL DEFAULT 0);
                CREATE INDEX IF NOT EXISTS runs_by_case ON runs(case_id,created);
                CREATE TABLE IF NOT EXISTS selections(case_id TEXT REFERENCES cases(id), lang TEXT,
                    run_id TEXT REFERENCES runs(id), reason TEXT NOT NULL, updated TEXT NOT NULL,
                    PRIMARY KEY(case_id,lang));
                CREATE TABLE IF NOT EXISTS reviews(case_id TEXT REFERENCES cases(id), lang TEXT,
                    run_id TEXT REFERENCES runs(id), reason TEXT NOT NULL, updated TEXT NOT NULL);
                INSERT INTO reviews(case_id,lang,run_id,reason,updated) SELECT s.* FROM selections s WHERE NOT EXISTS
                    (SELECT 1 FROM reviews v WHERE v.case_id=s.case_id AND v.lang=s.lang);
                CREATE TABLE IF NOT EXISTS requests(key TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL);
            """)
            if "kind" not in {r["name"] for r in db.execute("PRAGMA table_info(reviews)")}:
                db.execute("ALTER TABLE reviews ADD COLUMN kind TEXT NOT NULL DEFAULT 'adopted'")
            columns = {r["name"] for r in db.execute("PRAGMA table_info(runs)")}
            if "script_first" not in columns:
                db.execute("ALTER TABLE runs ADD COLUMN script_first INTEGER NOT NULL DEFAULT 0")
            if "previous_japanese" not in columns:
                db.execute("ALTER TABLE runs ADD COLUMN previous_japanese TEXT")
            db.execute("UPDATE runs SET status='interrupted',progress='停止した工程から再開できます' WHERE status='running'")
            db.executescript(idea_store.SCHEMA)
            # A batch and its ideas commit together, so unfinished generation can be replayed.
            db.execute("UPDATE idea_batches SET status='queued' WHERE status='running'")

    @contextmanager
    def db(self):
        with closing(sqlite3.connect(self.file, timeout=20)) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys=ON")
            with db:
                yield db

    def repeat(self, db, key, digest):
        row = db.execute("SELECT * FROM requests WHERE key=?", (key,)).fetchone()
        if row and row["digest"] != digest:
            raise ValueError("この実行番号は別の内容で使用済みです。")
        return json.loads(row["result"]) if row else None

    def list_ideas(self, theme_id=None):
        with self.db() as db:
            db.execute("BEGIN")
            return {"items": idea_store.list_items(db, theme_id, self.reference),
                    "batches": idea_store.list_batches(db, theme_id)}

    def submit_ideas(self, data, snapshot_fn, models_fn):
        key = required(data, "requestId", 128)
        digest = hashlib.sha256(packed(["/api/ideas", data]).encode()).hexdigest()
        with self.db() as db:
            result = self.repeat(db, key, digest)
        if result:
            return result
        theme, model = required(data, "themeId", 300), required(data, "model", 100)
        revision, brief = data.get("revision"), data.get("brief", "")
        if type(revision) is not int or revision < 1:
            raise ValueError("公開テーマの版を選んでください。")
        if not isinstance(brief, str) or len(brief) > 1800:
            raise ValueError("切り口は1800字以内で入力してください。")
        if model not in {m["id"] for m in models_fn() if m["available"]}:
            raise ValueError("選択したモデルはこの環境で利用できません。")
        snapshot = snapshot_fn(theme, revision)
        if (snapshot["themeId"], snapshot["revision"]) != (theme, revision):
            raise ValueError("取得したテーマの版が選択内容と一致しません。")
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            result = self.repeat(db, key, digest)
            if result:
                return result
            active = db.execute("""SELECT id FROM idea_batches WHERE theme_id=? AND revision=?
                                   AND model=? AND brief=? AND status IN ('running','queued')""",
                                (theme, revision, model, brief.strip())).fetchone()
            batch_id = active["id"] if active else uuid.uuid4().hex
            if not active:
                db.execute("""INSERT INTO idea_batches(id,theme_id,revision,theme_title,snapshot,brief,model,created,status)
                              VALUES(?,?,?,?,?,?,?,?,'queued')""",
                           (batch_id, theme, revision, snapshot["title"], packed(snapshot), brief.strip(), model, clock()))
            result = {"batchId": batch_id}
            db.execute("INSERT INTO requests VALUES(?,?,?)", (key, digest, packed(result)))
        self.wake.set()
        return result

    def work_ideas(self, generator):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            batch = db.execute("""SELECT * FROM idea_batches WHERE status='queued'
                                  ORDER BY created,rowid LIMIT 1""").fetchone()
            if not batch:
                return False
            db.execute("UPDATE idea_batches SET status='running' WHERE id=?", (batch["id"],))
        try:
            existing = self.list_ideas(batch["theme_id"])["items"]
            cards = generator(json.loads(batch["snapshot"]), batch["brief"], batch["model"], existing)
            with self.db() as db:
                db.execute("BEGIN IMMEDIATE")
                idea_store.save_generated(db, batch, cards, clock())
                db.execute("UPDATE idea_batches SET status='done' WHERE id=?", (batch["id"],))
        except Exception as exc:
            with self.db() as db:
                db.execute("UPDATE idea_batches SET status='failed',error=? WHERE id=?",
                           (str(exc)[:1200] or type(exc).__name__, batch["id"]))
        return True

    def set_idea_status(self, idea_id, status):
        if status not in ("candidate", "later"):
            raise ValueError("動画案の状態を確認してください。")
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            idea = idea_store.selected(db, idea_id)
            if idea["case_id"]:
                raise ValueError("制作に使った案です。紐づいた案件を開いてください。")
            db.execute("UPDATE ideas SET status=? WHERE id=?", (status, idea_id))

    def submit(self, route, data, snapshot_fn, models_fn, case_id=None):
        if case_id == REFERENCE:
            raise ValueError("品質見本は閲覧専用です。")
        key = required(data, "requestId", 128)
        digest = hashlib.sha256(packed([route, data]).encode()).hexdigest()
        with self.db() as db:
            existing = self.repeat(db, key, digest)
        if existing:
            return existing
        lang = data.get("lang")
        parent = data.get("parent")
        language = data.get("language", "both")
        if language not in ("both", *LANGS) or (lang and "language" in data):
            raise ValueError("制作する言語と場面の修正を分けて指定してください。")
        if parent is not None and not isinstance(parent, str):
            raise ValueError("元の試行を選んでください。")
        if language == "en" and not (case_id and parent):
            raise ValueError("英語版の元にする日本語の映像を選んでください。")
        script_first = data.get("scriptFirst", False)
        if type(script_first) is not bool:
            raise ValueError("台本確認の指定を確認してください。")
        if "visualTiming" in data and lang != "ja":
            raise ValueError("語りの前後の秒数は日本語の場面で編集できます。")
        model = required(data, "model", 100)
        idea_id = required(data, "ideaId", 128) if "ideaId" in data else None
        if idea_id and case_id:
            raise ValueError("動画案は新しい制作案件で選択してください。")
        if lang not in (*LANGS, None) or (lang and not parent):
            raise ValueError("修正する言語と元の版を確認してください。")
        if not lang and model not in {m["id"] for m in models_fn() if m["available"]}:
            raise ValueError("選択したモデルはこの環境で利用できません。")
        if not case_id:
            theme = required(data, "themeId", 300)
            revision = data.get("revision")
            if type(revision) is not int or revision < 1 or lang or parent:
                raise ValueError("公開テーマの版を選んでください。")
            brief = data.get("brief", "")
            if not isinstance(brief, str) or len(brief) > 1800:
                raise ValueError("切り口は1800字以内で入力してください。")
            if not idea_id:
                snapshot = snapshot_fn(theme, revision)
                if snapshot["themeId"] != theme or snapshot["revision"] != revision:
                    raise ValueError("取得したテーマの版が選択内容と一致しません。")
        reason = required(data, "reason", 1200) if lang else str(data.get("reason") or "").strip()[:1200]
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = self.repeat(db, key, digest)
            if existing:
                return existing
            now = clock()
            if not case_id:
                if idea_id:
                    idea = idea_store.selected(db, idea_id)
                    if (idea["theme_id"], idea["revision"]) != (theme, revision):
                        raise ValueError("動画案を保存したテーマと公開版を選んでください。")
                    if idea["case_id"]:
                        run = db.execute("SELECT id FROM runs WHERE case_id=? ORDER BY created,rowid LIMIT 1",
                                         (idea["case_id"],)).fetchone()
                        result = {"id": idea["case_id"], "runId": run["id"]}
                        db.execute("INSERT INTO requests VALUES(?,?,?)", (key, digest, packed(result)))
                        return result
                    snapshot = json.loads(idea["snapshot"])
                    brief = idea_store.production_brief(idea)
                case_id = uuid.uuid4().hex
                db.execute("INSERT INTO cases VALUES(?,?,?,?,?)",
                           (case_id, snapshot["title"], brief.strip(), packed(snapshot), now))
                if idea_id:
                    db.execute("UPDATE ideas SET status='used',case_id=? WHERE id=?", (case_id, idea_id))
            elif not db.execute("SELECT 1 FROM cases WHERE id=?", (case_id,)).fetchone():
                raise KeyError(case_id)
            plan = None
            previous_japanese = None
            draft_edit = False
            langs = list(LANGS) if language == "both" else [language]
            if parent:
                row = db.execute("SELECT plan,model,langs,editions,status FROM runs WHERE id=? AND case_id=?",
                                 (parent, case_id)).fetchone()
                if not row:
                    raise ValueError("元の試行が見つかりません。")
                editions = json.loads(row["editions"])
                if language == "ja" and row["plan"] and "ja" in json.loads(row["langs"]):
                    original = json.loads(row["plan"])
                    comments = db.execute("""SELECT kind,reason,updated FROM reviews
                                            WHERE case_id=? AND run_id=? AND lang='ja' ORDER BY rowid""",
                                          (case_id, parent))
                    previous_japanese = {"runId": parent, "title": original["titles"]["ja"],
                                         "narrations": [s["ja"]["narration"] for s in original["scenes"]],
                                         "reviews": [dict(comment) for comment in comments]}
                if language == "en":
                    video = self.folder / "cases" / case_id / parent / "ja" / "video.mp4"
                    if not row["plan"] or "ja" not in editions or not video.is_file() or not video.stat().st_size:
                        raise ValueError("英語版の元にする、再生できる日本語の映像を選んでください。")
                if lang:
                    draft_edit = row["status"] == "script_ready"
                    parent_langs = json.loads(row["langs"])
                    if not row["plan"] or lang not in parent_langs or (not draft_edit and lang not in editions):
                        raise ValueError("修正できる言語の台本または映像を選んでください。")
                    langs = parent_langs if draft_edit else [lang]
                    draft_edit = draft_edit or script_first
                    plan = json.loads(row["plan"])
                    scene_id = required(data, "sceneId", 100)
                    scene = next((s for s in plan["scenes"] if s["id"] == scene_id), None)
                    if scene is None:
                        raise ValueError("場面が見つかりません。")
                    narration = required(data, "narration", 800)
                    if lang == "ja":
                        from speech_reading import validate_readings
                        if "visualTiming" in data:
                            from editor import validate_visual_timing
                            timing = validate_visual_timing(data["visualTiming"])
                            old_timing = scene.get("visualTiming") or {}
                            if any(value != old_timing.get(key) for key, value in timing.items()):
                                scene["visualTiming"] = timing
                                plan.pop("editorialReview", None)
                        if narration != scene[lang]["narration"]:
                            plan.pop("editorialReview", None)
                        entries = data.get("readings", scene[lang].get("readings", []))
                        scene[lang]["readings"] = validate_readings(narration, entries)
                    elif data.get("readings"):
                        raise ValueError("読み指定は日本語の場面で編集できます。")
                    scene[lang]["narration"] = narration
                    model = row["model"]
            run_id = uuid.uuid4().hex
            status, progress = ("script_ready", "修正版の台本を保存しました") if draft_edit else ("queued", "順番待ち")
            db.execute("""INSERT INTO runs(id,case_id,parent,model,langs,reason,status,progress,created,plan,script_first,previous_japanese)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                       (run_id, case_id, parent, model, packed(langs), reason, status, progress,
                        now, packed(plan) if plan else None, int(script_first),
                        packed(previous_japanese) if previous_japanese else None))
            result = {"id": case_id, "runId": run_id}
            db.execute("INSERT INTO requests VALUES(?,?,?)", (key, digest, packed(result)))
            db.execute("UPDATE cases SET updated=? WHERE id=?", (now, case_id))
        self.wake.set()
        return result

    def resume(self, case_id, run_id):
        with self.db() as db:
            row = db.execute("SELECT status FROM runs WHERE id=? AND case_id=?", (run_id, case_id)).fetchone()
            if not row:
                raise KeyError(run_id)
            if row["status"] == "done":
                raise ValueError("この試行は完了しています。")
            db.execute("""UPDATE runs SET status='queued',progress='再開待ち',error=NULL,pause_requested=0,
                        script_first=CASE WHEN status='script_ready' THEN 0 ELSE script_first END
                        WHERE id=? AND status IN ('failed','interrupted','script_ready')""", (run_id,))
        self.wake.set()

    def pause(self, case_id, run):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT status FROM runs WHERE id=? AND case_id=?", (run, case_id)).fetchone()
            if not row:
                raise KeyError(run)
            if row["status"] == "queued":
                db.execute("UPDATE runs SET status='interrupted',progress='待機中に中断しました' WHERE id=?", (run,))
            elif row["status"] == "running":
                db.execute("UPDATE runs SET pause_requested=1,progress='次の工程で中断します' WHERE id=?", (run,))

    def review(self, case_id, data, kind):
        lang, run, reason = required(data, "lang"), required(data, "runId"), required(data, "reason", 1200)
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT editions FROM runs WHERE case_id=? AND id=?", (case_id, run)).fetchone()
            if not row or lang not in json.loads(row["editions"]):
                raise ValueError("完成した言語版を選んでください。")
            now = clock()
            if kind == "adopted":
                current = db.execute("SELECT run_id,reason FROM selections WHERE case_id=? AND lang=?",
                                     (case_id, lang)).fetchone()
                if current and (current["run_id"], current["reason"]) == (run, reason):
                    return
                db.execute("INSERT OR REPLACE INTO selections VALUES(?,?,?,?,?)", (case_id, lang, run, reason, now))
            elif kind == "rework":
                db.execute("DELETE FROM selections WHERE case_id=? AND lang=? AND run_id=?", (case_id, lang, run))
            else:
                raise ValueError("確認結果が不正です。")
            db.execute("INSERT INTO reviews(case_id,lang,run_id,reason,updated,kind) VALUES(?,?,?,?,?,?)",
                       (case_id, lang, run, reason, now, kind))
            db.execute("UPDATE cases SET updated=? WHERE id=?", (now, case_id))

    def case(self, case_id):
        if case_id == REFERENCE:
            return self.reference
        with self.db() as db:
            db.execute("BEGIN")
            row = db.execute("""SELECT c.*,i.id idea_id,i.title idea_title FROM cases c
                                LEFT JOIN ideas i ON i.case_id=c.id WHERE c.id=?""", (case_id,)).fetchone()
            if not row:
                raise KeyError(case_id)
            runs = db.execute("SELECT * FROM runs WHERE case_id=? ORDER BY created DESC,rowid DESC", (case_id,)).fetchall()
            selections = db.execute("SELECT * FROM selections WHERE case_id=?", (case_id,)).fetchall()
            reviews = db.execute("SELECT * FROM reviews WHERE case_id=? ORDER BY rowid DESC", (case_id,)).fetchall()
        snap = json.loads(row["snapshot"])
        accepted = {s["lang"]: s["run_id"] for s in selections}
        judgments = {(s["run_id"], s["lang"]): s for s in reversed(reviews)}
        states, history = {}, []
        for run in runs:
            editions = json.loads(run["editions"])
            for lang, edition in editions.items():
                prefix = f"/media/{case_id}/{run['id']}/{lang}/"
                judgment = judgments.get((run["id"], lang))
                edition.update(video=prefix + "video.mp4", subtitles=prefix + "subtitles.srt",
                               accepted=accepted.get(lang) == run["id"],
                               reviewStatus=judgment["kind"] if judgment else None,
                               reviewReason=judgment["reason"] if judgment else None)
            langs = json.loads(run["langs"])
            for lang in langs:
                rework = editions.get(lang, {}).get("reviewStatus") == "rework"
                states.setdefault(lang, edition_state(run["status"], lang in editions, accepted.get(lang) == run["id"], rework))
            history.append(dict(id=run["id"], parent=run["parent"], status=run["status"], model=run["model"],
                                reason=run["reason"], progress=run["progress"], created=run["created"],
                                langs=langs, error=run["error"], editions=editions,
                                plan=json.loads(run["plan"]) if run["plan"] else None))
        title = next((r["plan"]["titles"]["ja"] for r in reversed(history) if r["plan"]),
                     row["idea_title"] or row["title"])
        for lang in LANGS:
            states.setdefault(lang, "未生成")
        return dict(id=case_id, title=title, themeTitle=snap["title"], brief=row["brief"], themeId=snap["themeId"],
                    revision=snap["revision"], ideaId=row["idea_id"],
                    themeUrl=theme_url(snap["themeId"], snap["revision"]), updated=row["updated"], reference=False,
                    states=states, accepted=accepted, reviews=[dict(s) for s in reviews], runs=history)

    def list_cases(self):
        with self.db() as db:
            db.execute("BEGIN")
            rows = db.execute("""SELECT c.id,c.brief,c.updated,
                json_extract(c.snapshot,'$.themeId') themeId,json_extract(c.snapshot,'$.revision') revision,
                c.title themeTitle,coalesce((SELECT json_extract(r.plan,'$.titles.ja') FROM runs r
                WHERE r.case_id=c.id AND r.plan IS NOT NULL ORDER BY r.created,r.rowid LIMIT 1),i.title,c.title) title,
                i.id ideaId FROM cases c LEFT JOIN ideas i ON i.case_id=c.id ORDER BY c.updated DESC""").fetchall()
            items = {r["id"]: {**dict(r), "reference": False, "states": {}, "accepted": {}} for r in rows}
            for s in db.execute("SELECT case_id,lang,run_id FROM selections"):
                items[s["case_id"]]["accepted"][s["lang"]] = s["run_id"]
            verdicts = {(r["run_id"], r["lang"]): r["kind"]
                        for r in db.execute("SELECT run_id,lang,kind FROM reviews ORDER BY rowid")}
            # Listing cases should not deserialize every plan, timing table and fixed source package.
            runs = db.execute("""SELECT id,case_id,status,langs,json_type(editions,'$.ja') ja,
                                 json_type(editions,'$.en') en FROM runs ORDER BY created DESC,rowid DESC""")
            for r in runs:
                item = items[r["case_id"]]
                for lang in json.loads(r["langs"]):
                    rework = verdicts.get((r["id"], lang)) == "rework"
                    item["states"].setdefault(lang, edition_state(r["status"], bool(r[lang]), item["accepted"].get(lang) == r["id"], rework))
            for item in items.values():
                for lang in LANGS:
                    item["states"].setdefault(lang, "未生成")
        return [*items.values(), {k: v for k, v in self.reference.items() if k != "runs"}]

    def progress(self, run, message):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT pause_requested FROM runs WHERE id=?", (run,)).fetchone()[0]:
                raise Paused()
            db.execute("UPDATE runs SET progress=? WHERE id=?", (str(message)[:300], run))

    def process_next(self, generate, render):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("""SELECT r.*,c.snapshot,c.brief FROM runs r JOIN cases c ON r.case_id=c.id
                            WHERE r.status='queued' ORDER BY r.created,r.rowid LIMIT 1""").fetchone()
            if not row:
                return False
            run, case_id = row["id"], row["case_id"]
            db.execute("UPDATE runs SET status='running',progress='固定資料と台本を確認中' WHERE id=?", (run,))
        try:
            folder = self.folder / "cases" / case_id / run
            folder.mkdir(parents=True, exist_ok=True)
            snap = json.loads(row["snapshot"])
            langs = json.loads(row["langs"])
            if row["plan"]:
                plan = json.loads(row["plan"])
            else:
                brief = row["brief"]
                if row["reason"]:
                    brief += "\n今回の試行で重視する点\n" + row["reason"]
                options = {}
                message = "固定資料から日英の脚本を生成中"
                if langs == ["ja"]:
                    options["language"] = "ja"
                    options["progress"] = lambda message: self.progress(run, message)
                    if row["previous_japanese"]:
                        options["previous_japanese"] = json.loads(row["previous_japanese"])
                    message = "固定資料から日本語の脚本を生成中"
                elif langs == ["en"]:
                    with self.db() as db:
                        master = db.execute("SELECT plan FROM runs WHERE id=? AND case_id=?",
                                            (row["parent"], case_id)).fetchone()
                    options.update(language="en", master_plan=json.loads(master["plan"]))
                    message = "選んだ日本語版をもとに英語の脚本を生成中"
                self.progress(run, message)
                plan = generate(snap, brief, row["model"], folder, **options)
                if langs == ["en"]:
                    plan["japaneseMasterRunId"] = row["parent"]
                with self.db() as db:
                    if row["script_first"]:
                        note = "英語の台本を確認できます" if langs == ["en"] else "台本と日本語の読みを確認できます"
                        db.execute("""UPDATE runs SET plan=?,status='script_ready',progress=?,pause_requested=0
                                   WHERE id=?""", (packed(plan), note, run))
                        db.execute("UPDATE cases SET updated=? WHERE id=?", (clock(), case_id))
                        return True
                    db.execute("UPDATE runs SET plan=? WHERE id=?", (packed(plan), run))
            editions = json.loads(row["editions"])
            for lang in langs:
                if lang in editions:
                    continue
                self.progress(run, "日本語版を準備中" if lang == "ja" else "英語版を準備中")
                output = folder / lang
                output.mkdir(exist_ok=True)
                render(plan, lang, output, progress=lambda message: self.progress(run, message))
                timings = json.loads((output / "timings.json").read_text(encoding="utf-8"))
                if not all((output / f).is_file() and (output / f).stat().st_size for f in ("video.mp4", "subtitles.srt")):
                    raise ValueError("映像または字幕の書き出しを確認できませんでした。")
                editions[lang] = {"timings": timings}
                with self.db() as db:
                    db.execute("UPDATE runs SET editions=? WHERE id=?", (packed(editions), run))
            status, msg, error = "done", "書き出し完了", None
        except Paused:
            status, msg, error = "interrupted", "保存した工程から再開できます", None
        except Exception as exc:
            status, msg, error = "failed", "工程を確認して再開できます", str(exc)[:1200] or type(exc).__name__
        with self.db() as db:
            db.execute("UPDATE runs SET status=?,progress=?,error=? WHERE id=?", (status, msg, error, run))
            db.execute("UPDATE cases SET updated=? WHERE id=?", (clock(), case_id))
        return True

    def media(self, case_id, run, lang, name):
        if lang not in LANGS or name not in ("video.mp4", "subtitles.srt"):
            raise KeyError(name)
        if case_id == REFERENCE and run == "reference":
            if name == "video.mp4":
                return PILOT / ("walkman-pilot.mp4" if lang == "ja" else "walkman-pilot.en.mp4")
            return PILOT / f"walkman.{lang}.srt"
        if not re.fullmatch("[a-f0-9]{32}", case_id) or not re.fullmatch("[a-f0-9]{32}", run):
            raise KeyError(run)
        with self.db() as db:
            row = db.execute("SELECT editions FROM runs WHERE case_id=? AND id=?", (case_id, run)).fetchone()
        if not row or lang not in json.loads(row["editions"]):
            raise KeyError(lang)
        return self.folder / "cases" / case_id / run / lang / name
