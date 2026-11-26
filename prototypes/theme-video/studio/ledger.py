"""Local production cases, recoverable runs and independent edition selections."""
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import ipaddress
import json
import re
import sqlite3
import threading
import uuid
from urllib.parse import urlencode, urlsplit, urlunsplit

import idea_store
from editor import DIRECTED_FILM, MaterialRequired, _save_json
from editorial_decision import DIRECTED_DECISION_VERSION
from research_workflow import _source_id, _supplement
from stop_report import stop_report
from writer_feedback import RevisionNeeded

LANGS = ("ja", "en")
JOB_LABELS = {"queued": "待機中", "running": "生成中", "failed": "失敗", "interrupted": "中断",
              "needs_revision": "要改稿", "needs_material": "資料待ち", "script_ready": "台本確認"}
REFERENCE = "walkman-hot-line"
ROOT = Path(__file__).resolve().parent
PILOT = ROOT.parent / "walkman"
CUT_STATUSES = {"failed", "interrupted", "needs_revision", "needs_material", "script_ready"}
CODEX_FILM = "codex-film-v1"


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


def previewable_draft(plan):
    return bool(plan and plan.get("productionMode") == DIRECTED_FILM and plan.get("scenes") and
                all(s.get("asset") == "authored" and s.get("art") and s.get("ja") for s in plan["scenes"]))


def display_status(status, error):
    # Older runs recorded MaterialRequired under 'failed'. Preserve their original ledger entry.
    if status == "failed" and (error or "").startswith("追加資料が必要です。"):
        return "needs_material"
    return status


def accepts_material_leads(status, error, research):
    if status == "needs_material":
        return True
    rounds = (research or {}).get("rounds", [])
    # An older search failure can coexist with a later failure in an unrelated stage.
    return bool(status == "failed" and error and rounds and rounds[-1].get("status") == "error"
                and rounds[-1].get("error") == error)


def material_lead_url(value):
    message = "調査の手がかりには、認証不要の公開HTTPS URLを1件2048文字以内で指定してください。"
    if (not isinstance(value, str) or not 1 <= len(value) <= 2048
            or re.search(r"[\s\\\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]", value)):
        raise ValueError(message)
    try:
        url = urlsplit(value)
        host = (url.hostname or "").encode("idna").decode("ascii").lower()
        if url.scheme != "https" or url.username is not None or url.port not in (None, 443) or "%" in host:
            raise ValueError(message)
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            labels = host.split(".")
            if (len(host) > 253 or len(labels) < 2 or host == "home.arpa" or host.endswith(".home.arpa")
                    or labels[-1] in ("local", "localhost", "internal", "home", "lan")
                    or re.fullmatch(r"\d+|0x[0-9a-f]+", labels[-1])
                    or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels)):
                raise ValueError(message)
        else:
            if not address.is_global or address.is_multicast or address.is_reserved:
                raise ValueError(message)
            host = f"[{address}]" if address.version == 6 else str(address)
        return urlunsplit(("https", host, url.path or "/", url.query, url.fragment))
    except (ValueError, UnicodeError) as exc:
        raise ValueError(message) from exc


def material_research(run_folder):
    try:
        report = json.loads((run_folder / "material-research.json").read_text(encoding="utf-8"))
        if not isinstance(report, dict) or not isinstance(report.get("rounds"), list):
            raise ValueError("invalid research history")
        for entry in report["rounds"]:
            if (not isinstance(entry, dict) or not isinstance(entry.get("sources", []), list)
                    or not all(isinstance(source, dict) for source in entry.get("sources", []))):
                raise ValueError("invalid research round")
        return {"rounds": report["rounds"]}
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        return {"rounds": [], "error": "この試行の追加調査記録を読み込めませんでした。"}


def editorial_alternative(folder):
    try:
        raw = json.loads((folder / "editorial-alternative.json").read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        proposal = {key: required(raw, key, limit) for key, limit in (("title", 120), ("brief", 1800), ("reason", 1200))}
    except (OSError, ValueError):
        return None
    return {**proposal, "fingerprint": hashlib.sha256(packed(proposal).encode()).hexdigest()}


def available_alternative(folder, run, research):
    status = display_status(run["status"], run["error"])
    if ("ja" not in json.loads(run["langs"]) or (research or {}).get("error")
            or not accepts_material_leads(status, run["error"], research)):
        return None
    proposal = editorial_alternative(folder)
    if not proposal:
        return None
    path = folder / "editorial-decision.json"
    if status == "needs_material" and run["production_mode"] != DIRECTED_FILM and not path.exists():
        return proposal  # Older board-based trials saved the approved proposal by itself.
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
        decision = record["decision"]
        if decision["outcome"] != "alternative" or any(decision["alternative"][key] != proposal[key] for key in ("title", "brief", "reason")):
            return None
        if run["production_mode"] == DIRECTED_FILM:
            if record.get("instructionVersion") != DIRECTED_DECISION_VERSION:
                return None  # Earlier reviews could treat proposed staging as an operator requirement.
            current_ids = {_source_id(s) for r in (research or {}).get("rounds", []) if r.get("status") == "done" for s in r.get("sources", [])}
            if set(record["reviewedResearchIds"]) != current_ids:
                return None
        if status == "needs_material":
            return proposal if decision["reason"] == run["error"] else None
        rounds = research["rounds"]
        confirmed = next((r for r in reversed(rounds[:-1]) if r.get("status") == "done" and not r.get("inheritedFromRun")), None)
        if confirmed and record["need"] == rounds[-1]["need"] and record["researchRemaining"] == confirmed["remaining"]:
            return proposal
    except (OSError, ValueError, TypeError, KeyError):
        pass
    return None


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
        self.cut_lock = threading.Lock()
        self.last_cut = None
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
                CREATE TABLE IF NOT EXISTS run_alternatives(
                    run_id TEXT PRIMARY KEY REFERENCES runs(id), source_run TEXT NOT NULL REFERENCES runs(id),
                    fingerprint TEXT NOT NULL, proposal TEXT NOT NULL, research TEXT NOT NULL,
                    UNIQUE(source_run,fingerprint));
            """)
            if "kind" not in {r["name"] for r in db.execute("PRAGMA table_info(reviews)")}:
                db.execute("ALTER TABLE reviews ADD COLUMN kind TEXT NOT NULL DEFAULT 'adopted'")
            columns = {r["name"] for r in db.execute("PRAGMA table_info(runs)")}
            if "production_mode" not in columns:
                db.execute("ALTER TABLE runs ADD COLUMN production_mode TEXT NOT NULL DEFAULT 'boards-v1'")
            if "script_first" not in columns:
                db.execute("ALTER TABLE runs ADD COLUMN script_first INTEGER NOT NULL DEFAULT 0")
            if "previous_japanese" not in columns:
                db.execute("ALTER TABLE runs ADD COLUMN previous_japanese TEXT")
            if "editorial_origin" not in columns:
                db.execute("ALTER TABLE runs ADD COLUMN editorial_origin TEXT REFERENCES runs(id)")
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
            return {"items": idea_store.list_items(db, theme_id, self.reference, display_status),
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
        production_mode = data.get("productionMode", CODEX_FILM)
        language = data.get("language", "ja" if production_mode == CODEX_FILM else "both")
        if production_mode not in (CODEX_FILM, DIRECTED_FILM, "boards-v1"):
            raise ValueError("制作方式を確認してください。")
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
        new_idea_case = data.get("newIdeaCase", False)
        if type(new_idea_case) is not bool or (new_idea_case and not idea_id):
            raise ValueError("別案件を制作する動画案を選んでください。")
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
                    snapshot, brief, initial_case = idea_store.production_input(db, idea_id)
                    if (snapshot["themeId"], snapshot["revision"]) != (theme, revision):
                        raise ValueError("動画案を保存したテーマと公開版を選んでください。")
                    if initial_case and not new_idea_case:
                        run = db.execute("SELECT id FROM runs WHERE case_id=? ORDER BY created,rowid LIMIT 1",
                                         (initial_case,)).fetchone()
                        result = {"id": initial_case, "runId": run["id"]}
                        db.execute("INSERT INTO requests VALUES(?,?,?)", (key, digest, packed(result)))
                        return result
                case_id = uuid.uuid4().hex
                db.execute("INSERT INTO cases VALUES(?,?,?,?,?)",
                           (case_id, snapshot["title"], brief.strip(), packed(snapshot), now))
                if idea_id:
                    idea_store.link_case(db, idea_id, case_id)
            elif not db.execute("SELECT 1 FROM cases WHERE id=?", (case_id,)).fetchone():
                raise KeyError(case_id)
            plan = None
            previous_japanese = None
            editorial_origin = None
            draft_edit = False
            langs = list(LANGS) if language == "both" else [language]
            if parent:
                row = db.execute("SELECT plan,model,langs,editions,status,editorial_origin,production_mode FROM runs WHERE id=? AND case_id=?",
                                 (parent, case_id)).fetchone()
                if not row:
                    raise ValueError("元の試行が見つかりません。")
                editorial_origin = row["editorial_origin"]
                if lang or (language == "en" and "productionMode" not in data):
                    production_mode = row["production_mode"]
                if language == "en" and production_mode not in (CODEX_FILM, row["production_mode"]):
                    raise ValueError("英語版はCodexへの直接依頼か、日本語版と同じ制作方式を選んでください。")
                editions = json.loads(row["editions"])
                redirect_japanese = not lang and (language == "ja" or
                                   (language == "both" and production_mode in (DIRECTED_FILM, CODEX_FILM)))
                if redirect_japanese and row["plan"] and "ja" in json.loads(row["langs"]):
                    original = json.loads(row["plan"])
                    comments = db.execute("""SELECT kind,reason,updated FROM reviews
                                            WHERE case_id=? AND run_id=? AND lang='ja' ORDER BY rowid""",
                                          (case_id, parent))
                    previous_japanese = {"runId": parent, "title": original["titles"]["ja"],
                                         "narrations": [s["ja"]["narration"] for s in original["scenes"] if "ja" in s],
                                         "reviews": [dict(comment) for comment in comments]}
                    if original.get("productionMode") == DIRECTED_FILM:
                        previous_japanese["direction"] = [{k: s[k] for k in (
                            "id", "picture", "medium", "sourceIds", "leadSeconds", "tailSeconds", "silentSeconds", "labels") if k in s}
                            for s in original["scenes"]]
                if language == "en":
                    video = self.folder / "cases" / case_id / parent / "ja" / "video.mp4"
                    if not row["plan"] or "ja" not in editions or not video.is_file() or not video.stat().st_size:
                        raise ValueError("英語版の元にする、再生できる日本語の映像を選んでください。")
                if lang and production_mode == CODEX_FILM:
                    if row["status"] != "script_ready" or lang not in json.loads(row["langs"]):
                        raise ValueError("動画の改稿は、元の版を選んで新しい試行に追加指示を入力してください。")
                    plan = json.loads(row["plan"])
                    if not plan.get("authorDraft", {}).get(lang):
                        raise ValueError("編集できる台本を選んでください。")
                    plan["authorDraft"][lang] = required(data, "draftText", 24000)
                    model, langs, draft_edit = row["model"], json.loads(row["langs"]), True
                    if lang == "ja" and "en" in langs:
                        plan["authorDraft"].pop("en", None)
                elif lang:
                    draft_edit = row["status"] == "script_ready"
                    parent_langs = json.loads(row["langs"])
                    if not row["plan"] or lang not in parent_langs or (not draft_edit and lang not in editions):
                        raise ValueError("修正できる言語の台本または映像を選んでください。")
                    langs = parent_langs if draft_edit else [lang]
                    draft_edit = draft_edit or script_first
                    plan = json.loads(row["plan"])
                    if plan.get("productionMode") == DIRECTED_FILM:
                        plan.setdefault("storyboardRunId", parent)
                    scene_id = required(data, "sceneId", 100)
                    scene = next((s for s in plan["scenes"] if s["id"] == scene_id), None)
                    if scene is None:
                        raise ValueError("場面が見つかりません。")
                    silent = scene.get("asset") == "authored" and not scene[lang]["narration"]
                    if silent:
                        if data.get("narration") != "" or lang != "ja":
                            raise ValueError("無言の場面は日本語版から秒数を編集できます。")
                        seconds = data.get("silentSeconds", scene["silentSeconds"])
                        if type(seconds) not in (float, int) or not 1 / 24 <= seconds <= 60:
                            raise ValueError("無言で見せる秒数を1フレームから60秒の間で指定してください。")
                        scene["silentSeconds"] = seconds
                        narration = ""
                    else:
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
                            if plan.get("productionMode") == DIRECTED_FILM and "en" in langs:
                                # The changed line has no English counterpart until it is adapted.
                                # Keep other English lines, including any operator edits.
                                scene.pop("en", None)
                                adaptation = plan.pop("adaptation", {})
                                if adaptation.get("masterModel"):
                                    plan["model"] = adaptation["masterModel"]
                                script_first = True
                                draft_edit = False
                        if scene.get("asset") == "authored":
                            plan.pop("filmReview", None)
                            if "visualTiming" in data and not silent:
                                scene["leadSeconds"] = timing.get("beforeVoice") or 0
                                scene["tailSeconds"] = timing.get("afterVoice") or 0
                        entries = data.get("readings", scene[lang].get("readings", []))
                        scene[lang]["readings"] = validate_readings(narration, entries) if not silent else []
                    elif data.get("readings"):
                        raise ValueError("読み指定は日本語の場面で編集できます。")
                    scene[lang]["narration"] = narration
                    model = row["model"]
            run_id = uuid.uuid4().hex
            status, progress = ("script_ready", "修正版の台本を保存しました") if draft_edit else ("queued", "順番待ち")
            db.execute("""INSERT INTO runs(id,case_id,parent,model,langs,reason,status,progress,created,plan,script_first,previous_japanese,editorial_origin,production_mode)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                       (run_id, case_id, parent, model, packed(langs), reason, status, progress,
                        now, packed(plan) if plan else None, int(script_first),
                        packed(previous_japanese) if previous_japanese else None, editorial_origin, production_mode))
            result = {"id": case_id, "runId": run_id}
            db.execute("INSERT INTO requests VALUES(?,?,?)", (key, digest, packed(result)))
            db.execute("UPDATE cases SET updated=? WHERE id=?", (now, case_id))
        self.wake.set()
        return result

    def start_alternative(self, case_id, run_id, fingerprint):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            source = db.execute("SELECT * FROM runs WHERE case_id=? AND id=?", (case_id, run_id)).fetchone()
            if not source:
                raise KeyError(run_id)
            prior = db.execute("SELECT run_id FROM run_alternatives WHERE source_run=? AND fingerprint=?",
                               (run_id, fingerprint)).fetchone()
            if prior:
                return {"id": case_id, "runId": prior["run_id"]}
            folder = self.folder / "cases" / case_id / run_id
            report = material_research(folder) or {"rounds": []}
            proposal = available_alternative(folder, source, report)
            if not proposal or proposal["fingerprint"] != fingerprint:
                raise ValueError("現在の資料と編集判断で選択できる別案を、案件画面で確認してください。")
            if report.get("error"):
                raise ValueError(report["error"])
            rounds = [dict(r, inheritedFromRun=r.get("inheritedFromRun") or run_id) for r in report["rounds"]
                      if r.get("status") == "done" and r.get("sources")]
            new_run, now = uuid.uuid4().hex, clock()
            db.execute("""INSERT INTO runs(id,case_id,parent,model,langs,reason,status,progress,created,script_first,editorial_origin,production_mode)
                          VALUES(?,?,?,?,?,'','queued','別案で生成待ち',?,?,?,?)""",
                       (new_run, case_id, run_id, source["model"], source["langs"], now, source["script_first"], new_run, DIRECTED_FILM))
            db.execute("INSERT INTO run_alternatives VALUES(?,?,?,?,?)",
                       (new_run, run_id, fingerprint, packed(proposal), packed({"inheritedFromRun": run_id, "rounds": rounds})))
            db.execute("UPDATE cases SET updated=? WHERE id=?", (now, case_id))
        self.wake.set()
        return {"id": case_id, "runId": new_run}

    def resume(self, case_id, run_id, material_leads=None):
        if material_leads is None:
            material_leads = []
        if not isinstance(material_leads, list) or len(material_leads) > 6:
            raise ValueError("調査の手がかりは1回につきURLを6件まで指定できます。")
        urls = [material_lead_url(value) for value in material_leads]
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT status,error FROM runs WHERE id=? AND case_id=?", (run_id, case_id)).fetchone()
            if not row:
                raise KeyError(run_id)
            if row["status"] == "done":
                raise ValueError("この試行は完了しています。")
            if urls:
                folder = self.folder / "cases" / case_id / run_id
                path = folder / "material-leads.json"
                saved = []
                if path.is_file():
                    stored = json.loads(path.read_text(encoding="utf-8"))
                    if (not isinstance(stored, dict) or not isinstance(stored.get("urls"), list)
                            or not all(isinstance(url, str) for url in stored["urls"])):
                        raise ValueError("この試行に保存された調査の手がかりを読み込めませんでした。")
                    saved = stored["urls"]
                merged = list(dict.fromkeys([*saved, *urls]))
                status = display_status(row["status"], row["error"])
                research = material_research(folder) if status == "failed" else None
                if not accepts_material_leads(status, row["error"], research):
                    if merged == saved and row["status"] in ("queued", "running"):
                        return
                    raise ValueError("調査の手がかりは資料待ち、または追加調査で停止した試行に添えられます。")
                if merged != saved:
                    folder.mkdir(parents=True, exist_ok=True)
                    _save_json(path, {"urls": merged})
            db.execute("""UPDATE runs SET status='queued',progress='再開待ち',error=NULL,pause_requested=0,
                        script_first=CASE WHEN status='script_ready' THEN 0 ELSE script_first END
                        WHERE id=? AND status IN ('failed','interrupted','needs_revision','needs_material','script_ready')""", (run_id,))
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
            row = db.execute("""SELECT c.*,m.idea_id,m.idea_title,m.number,m.total FROM cases c
                                LEFT JOIN idea_case_members m ON m.case_id=c.id WHERE c.id=?""", (case_id,)).fetchone()
            if not row:
                raise KeyError(case_id)
            runs = db.execute("""SELECT r.*,a.source_run,a.proposal FROM runs r
                                 LEFT JOIN run_alternatives a ON r.editorial_origin=a.run_id
                                 WHERE r.case_id=? ORDER BY r.created DESC,r.rowid DESC""", (case_id,)).fetchall()
            selections = db.execute("SELECT * FROM selections WHERE case_id=?", (case_id,)).fetchall()
            reviews = db.execute("SELECT * FROM reviews WHERE case_id=? ORDER BY rowid DESC", (case_id,)).fetchall()
        snap = json.loads(row["snapshot"])
        accepted = {s["lang"]: s["run_id"] for s in selections}
        judgments = {(s["run_id"], s["lang"]): s for s in reversed(reviews)}
        states, history = {}, []
        # Legacy cases also appear in the idea library under their first finished cut.
        # That generated label wasn't an idea selected for a later trial.
        idea_title = None if row["idea_id"] == "previous-" + case_id else row["idea_title"]
        started = {(r["source_run"], json.loads(r["proposal"])["fingerprint"]): r["id"]
                   for r in runs if r["editorial_origin"] == r["id"]}
        for run in runs:
            status = display_status(run["status"], run["error"])
            editions = json.loads(run["editions"])
            for lang, edition in editions.items():
                prefix = f"/media/{case_id}/{run['id']}/{lang}/"
                judgment = judgments.get((run["id"], lang))
                edition.update(video=prefix + "video.mp4", subtitles=prefix + "subtitles.srt",
                               accepted=accepted.get(lang) == run["id"],
                               reviewStatus=judgment["kind"] if judgment else None,
                               reviewReason=judgment["reason"] if judgment else None)
                if (self.folder / "cases" / case_id / run["id"] / lang / "contact-sheet.png").is_file():
                    edition["contactSheet"] = prefix + "contact-sheet.png"
            langs = json.loads(run["langs"])
            for lang in langs:
                rework = editions.get(lang, {}).get("reviewStatus") == "rework"
                states.setdefault(lang, edition_state(status, lang in editions, accepted.get(lang) == run["id"], rework))
            folder = self.folder / "cases" / case_id / run["id"]
            research = material_research(folder)
            takes_leads = accepts_material_leads(status, run["error"], research)
            excerpts = {(s["url"], s["excerpt"]) for r in (research or {}).get("rounds", []) if r.get("status") == "done"
                        for s in r.get("sources", []) if isinstance(s.get("url"), str) and isinstance(s.get("excerpt"), str)}
            recover_saved = status == "failed" and takes_leads and run["production_mode"] == DIRECTED_FILM and bool(excerpts) and not run["plan"]
            proposal = available_alternative(folder, run, research)
            if proposal:
                proposal["startedRunId"] = started.get((run["id"], proposal["fingerprint"]))
            chosen = json.loads(run["proposal"]) if run["proposal"] else None
            item = dict(id=run["id"], parent=run["parent"], status=status, model=run["model"],
                        productionMode=run["production_mode"],
                        reason=run["reason"], progress=run["progress"], created=run["created"],
                        langs=langs, error=run["error"], editions=editions,
                        materialResearch=research, canAddMaterialLeads=takes_leads, resumeWithSavedSources=recover_saved,
                        savedExcerptCount=len(excerpts),
                        editorialAlternative=proposal, chosenAlternative={**chosen, "sourceRunId": run["source_run"]} if chosen else None,
                        plan=json.loads(run["plan"]) if run["plan"] else None)
            if run["production_mode"] == CODEX_FILM:
                item["authorCommissions"] = [
                    {"lang": lang, "stage": stage} for lang in langs for stage in ("draft", "film")
                    if (folder / "author" / f"{lang}-{stage}-commission.json").is_file()]
            if status in CUT_STATUSES and run["production_mode"] == DIRECTED_FILM and "ja" in langs:
                if status == "script_ready":
                    available = previewable_draft(item["plan"])
                else:
                    available = (folder / "film-cut.json").is_file() or ((folder / "editor-input.json").is_file() and
                                any((folder / "editor-stages").glob("edit-review-*.json")))
                if available:
                    item["cutAvailable"] = True
            if item["plan"] and item["plan"].get("productionMode") == DIRECTED_FILM:
                for scene in item["plan"]["scenes"]:
                    scene.pop("art", None)
                board_run = item["plan"].get("storyboardRunId", run["id"])
                if (folder.parent / board_run / "storyboard.jpg").is_file():
                    item["storyboard"] = f"/media/{case_id}/{board_run}/ja/storyboard.jpg"
            item["stopReport"] = stop_report(item, folder, snap["title"], idea_title, row["brief"])
            history.append(item)
        title = next((r["plan"]["titles"]["ja"] for r in reversed(history)
                      if (r["plan"] or {}).get("titles", {}).get("ja") and not r["chosenAlternative"]),
                     row["idea_title"] or row["title"])
        for lang in LANGS:
            states.setdefault(lang, "未生成")
        return dict(id=case_id, title=title, themeTitle=snap["title"], brief=row["brief"], themeId=snap["themeId"],
                    revision=snap["revision"], ideaId=row["idea_id"], ideaCaseNumber=row["number"], ideaCaseCount=row["total"],
                    themeUrl=theme_url(snap["themeId"], snap["revision"]), updated=row["updated"], reference=False,
                    states=states, accepted=accepted, reviews=[dict(s) for s in reviews], runs=history)

    def list_cases(self):
        with self.db() as db:
            db.execute("BEGIN")
            rows = db.execute("""SELECT c.id,c.brief,c.updated,
                json_extract(c.snapshot,'$.themeId') themeId,json_extract(c.snapshot,'$.revision') revision,
                c.title themeTitle,coalesce((SELECT json_extract(r.plan,'$.titles.ja') FROM runs r
                WHERE r.case_id=c.id AND r.plan IS NOT NULL AND r.editorial_origin IS NULL
                ORDER BY r.created,r.rowid LIMIT 1),m.idea_title,c.title) title,
                m.idea_id ideaId,m.number ideaCaseNumber,m.total ideaCaseCount FROM cases c
                LEFT JOIN idea_case_members m ON m.case_id=c.id ORDER BY c.updated DESC,c.rowid DESC""").fetchall()
            items = {r["id"]: {**dict(r), "reference": False, "states": {}, "accepted": {}} for r in rows}
            for s in db.execute("SELECT case_id,lang,run_id FROM selections"):
                items[s["case_id"]]["accepted"][s["lang"]] = s["run_id"]
            verdicts = {(r["run_id"], r["lang"]): r["kind"]
                        for r in db.execute("SELECT run_id,lang,kind FROM reviews ORDER BY rowid")}
            # Listing cases should not deserialize every plan, timing table and fixed source package.
            runs = db.execute("""SELECT id,case_id,status,error,langs,json_type(editions,'$.ja') ja,
                                 json_type(editions,'$.en') en FROM runs ORDER BY created DESC,rowid DESC""")
            for r in runs:
                item = items[r["case_id"]]
                for lang in json.loads(r["langs"]):
                    rework = verdicts.get((r["id"], lang)) == "rework"
                    status = display_status(r["status"], r["error"])
                    item["states"].setdefault(lang, edition_state(status, bool(r[lang]), item["accepted"].get(lang) == r["id"], rework))
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

    def _produce_codex(self, row, folder, snap, produce):
        run, case_id = row["id"], row["case_id"]
        langs, editions = json.loads(row["langs"]), json.loads(row["editions"])
        plan = json.loads(row["plan"]) if row["plan"] else None
        draft = bool(row["script_first"])
        brief = row["brief"]
        if row["proposal"]:
            choice = json.loads(row["proposal"])
            brief = "仮題　" + choice["title"] + "\n" + choice["brief"]
            snap = _supplement(snap, json.loads(row["research"])["rounds"])
        if row["reason"]:
            brief += "\n今回の試行で重視する点\n" + row["reason"]
        if row["previous_japanese"]:
            snap["previousJapanese"] = json.loads(row["previous_japanese"])
        parent_folder, parent_plan = None, None
        if row["parent"]:
            source_id = row["parent"]
            if langs == ["en"] and (plan or {}).get("japaneseMasterRunId"):
                # An edited English script may itself be the child of a draft.
                # Hand the author the Japanese film originally chosen in the desk.
                source_id = plan["japaneseMasterRunId"]
            with self.db() as db:
                source = db.execute("SELECT plan FROM runs WHERE id=? AND case_id=?",
                                    (source_id, case_id)).fetchone()
            if source and source["plan"]:
                parent_folder = folder.parent / source_id
                parent_plan = json.loads(source["plan"])
            if not row["proposal"]:
                report = material_research(folder.parent / row["parent"]) or {}
                snap = _supplement(snap, report.get("rounds", []))
        def progress(note):
            self.progress(run, note)

        for lang in langs:
            if lang in editions or (draft and (plan or {}).get("authorDraft", {}).get(lang)):
                continue
            label = "日本語" if lang == "ja" else "英語"
            progress("Codexが" + label + ("の台本を執筆中" if draft else "の映像を制作中"))
            source_folder, source_plan = parent_folder, parent_plan
            if lang == "en" and "ja" in langs:
                source_folder, source_plan = folder, plan
            plan = produce(snap, brief, row["model"], folder, lang, draft=draft, plan=plan,
                           parent_folder=source_folder, parent_plan=source_plan, progress=progress)
            if langs == ["en"] and not plan.get("japaneseMasterRunId"):
                plan["japaneseMasterRunId"] = (parent_plan or {}).get("japaneseMasterRunId") or row["parent"]
            if draft:
                if not (plan or {}).get("authorDraft", {}).get(lang):
                    raise ValueError("確認用の台本を読み込めませんでした。")
            else:
                output = folder / lang
                video = output / "video.mp4"
                if not video.is_file() or not video.stat().st_size or not (output / "subtitles.srt").is_file():
                    raise ValueError("映像または字幕の書き出しを確認できませんでした。")
                timings = json.loads((output / "timings.json").read_text(encoding="utf-8"))
                editions[lang] = {"timings": timings}
            with self.db() as db:
                db.execute("UPDATE runs SET plan=?,editions=? WHERE id=?", (packed(plan), packed(editions), run))
        status, note = ("script_ready", "台本を確認できます") if draft else ("done", "書き出し完了")
        with self.db() as db:
            db.execute("UPDATE runs SET status=?,progress=?,error=NULL,pause_requested=0 WHERE id=?", (status, note, run))
            db.execute("UPDATE cases SET updated=? WHERE id=?", (clock(), case_id))

    def process_next(self, generate, render, *, produce=None):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("""SELECT r.*,c.snapshot,c.brief,a.proposal,a.research,i.idea_id AS selected_idea_id
                            FROM runs r JOIN cases c ON r.case_id=c.id
                            LEFT JOIN idea_cases i ON i.case_id=c.id
                            LEFT JOIN run_alternatives a ON r.editorial_origin=a.run_id
                            WHERE r.status='queued' ORDER BY r.created,r.rowid LIMIT 1""").fetchone()
            if not row:
                return False
            run, case_id = row["id"], row["case_id"]
            db.execute("UPDATE runs SET status='running',progress='固定資料と台本を確認中' WHERE id=?", (run,))
        try:
            folder = self.folder / "cases" / case_id / run
            folder.mkdir(parents=True, exist_ok=True)
            snap = json.loads(row["snapshot"])
            if row["production_mode"] in (DIRECTED_FILM, CODEX_FILM):
                snap["productionMode"] = row["production_mode"]
                snap["selectedVideoIdea"] = bool(row["selected_idea_id"] and not row["proposal"])
            if row["production_mode"] == CODEX_FILM:
                if produce is None:
                    from direct_production import produce
                self._produce_codex(row, folder, snap, produce)
                return True
            langs = json.loads(row["langs"])
            plan = json.loads(row["plan"]) if row["plan"] else None
            adapt_edit = (plan and plan.get("productionMode") == DIRECTED_FILM and "en" in langs
                          and any("en" not in scene for scene in plan["scenes"]))
            if not plan or adapt_edit:
                brief = row["brief"]
                if row["proposal"]:
                    choice = json.loads(row["proposal"])
                    brief = "仮題　" + choice["title"] + "\n" + choice["brief"]
                    report_path = folder / "material-research.json"
                    inherited = json.loads(row["research"])
                    if inherited["rounds"] and not report_path.exists():
                        _save_json(report_path, inherited)
                if row["reason"]:
                    brief += "\n今回の試行で重視する点\n" + row["reason"]
                options = {"progress": lambda message: self.progress(run, message)}
                message = "固定資料から日英の脚本を生成中"
                if row["previous_japanese"]:
                    options["previous_japanese"] = json.loads(row["previous_japanese"])
                if adapt_edit:
                    options.update(language="en", master_plan=plan)
                    message = "修正した日本語の台詞に合わせて英語の台本を更新中"
                elif langs == ["ja"]:
                    options["language"] = "ja"
                    message = "固定資料から日本語の脚本を生成中"
                elif langs == ["en"]:
                    with self.db() as db:
                        master = db.execute("SELECT plan FROM runs WHERE id=? AND case_id=?",
                                            (row["parent"], case_id)).fetchone()
                    options.update(language="en", master_plan=json.loads(master["plan"]))
                    message = "選んだ日本語版をもとに英語の脚本を生成中"
                self.progress(run, message)
                generated = generate(snap, brief, row["model"], folder, **options)
                if adapt_edit:
                    generated["titles"]["en"] = plan["titles"]["en"]
                    for source, target in zip(plan["scenes"], generated["scenes"]):
                        if "en" in source:
                            target["en"] = source["en"]
                        if source.get("labels"):
                            target["labels"] = source["labels"]
                plan = generated
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
                captions = output / "subtitles.srt"
                silent = plan.get("productionMode") == DIRECTED_FILM and all(
                    not scene[lang]["narration"] for scene in plan["scenes"])
                if (not (output / "video.mp4").is_file() or not (output / "video.mp4").stat().st_size
                        or not captions.is_file() or (not silent and not captions.stat().st_size)):
                    raise ValueError("映像または字幕の書き出しを確認できませんでした。")
                editions[lang] = {"timings": timings}
                with self.db() as db:
                    db.execute("UPDATE runs SET editions=? WHERE id=?", (packed(editions), run))
            status, msg, error = "done", "書き出し完了", None
        except Paused:
            status, msg, error = "interrupted", "保存した工程から再開できます", None
        except RevisionNeeded as exc:
            status, msg, error = "needs_revision", "直近の稿と指摘から改稿を再開できます", str(exc)[:1200]
        except MaterialRequired as exc:
            status, msg, error = "needs_material", "追加調査して同じ試行を再開できます", str(exc)[:1200]
        except Exception as exc:
            status, msg, error = "failed", "工程を確認して再開できます", str(exc)[:1200] or type(exc).__name__
        with self.db() as db:
            db.execute("UPDATE runs SET status=?,progress=?,error=? WHERE id=?", (status, msg, error, run))
            db.execute("UPDATE cases SET updated=? WHERE id=?", (clock(), case_id))
        return True

    def _cut_run(self, case_id, run, *, paused):
        if not all(re.fullmatch("[a-f0-9]{32}", value) for value in (case_id, run)):
            raise KeyError(run)
        with self.db() as db:
            row = db.execute("""SELECT status,error,production_mode,langs,CASE WHEN ? AND status='script_ready' THEN plan END AS draft
                              FROM runs WHERE case_id=? AND id=?""", (paused, case_id, run)).fetchone()
        if not row or row["production_mode"] != DIRECTED_FILM or "ja" not in json.loads(row["langs"]):
            raise KeyError(run)
        if paused and display_status(row["status"], row["error"]) not in CUT_STATUSES:
            raise ValueError("この試行の状態が変わりました。制作状況を確認してください。")
        return self.folder / "cases" / case_id / run, row

    def _reviewed_cut(self, folder):
        from film_checkpoint import FILE, read_saved_cut
        from writer_feedback import request_digest
        # Reading a legacy cut verifies the actual drawings for all scenes. Keep the
        # most recent explicit request so trying several excerpts only verifies it once.
        native = folder / FILE
        files = [native] if native.is_file() else [folder / "editor-input.json", folder / "editor-stages"]
        def signature():
            return tuple((str(path), path.stat().st_mtime_ns) for path in files)
        if not all(path.exists() for path in files):
            raise ValueError("この試行には試写できる保存稿がまだありません。")
        with self.cut_lock:
            key = signature()
            if self.last_cut and self.last_cut[0] == key:
                return self.last_cut[1:]
            cut = read_saved_cut(folder)
            if not cut or not cut["plan"].get("scenes"):
                raise ValueError("この試行で場面と試写指摘を照合できる保存稿が見つかりません。")
            if signature() != key or (native not in files and native.is_file()):
                raise ValueError("保存稿が更新されました。場面一覧を開き直してください。")
            digest = request_digest([cut["plan"], cut["review"]])
            self.last_cut = (key, digest, cut)
            return digest, cut

    def _saved_cut(self, case_id, run):
        from writer_feedback import request_digest
        folder, row = self._cut_run(case_id, run, paused=True)
        if row["status"] == "script_ready":
            # A manual edit creates an independent run, including the full artwork, before creating its folder.
            plan = json.loads(row["draft"]) if row["draft"] else None
            if not previewable_draft(plan):
                raise ValueError("この版には試写できる原画と台本が揃っていません。")
            return folder, request_digest([run, plan]), {"plan": plan, "review": {} if plan.get("filmReview") else None}
        digest, cut = self._reviewed_cut(folder)
        return folder, digest, cut

    def cut_index(self, case_id, run):
        _, digest, cut = self._saved_cut(case_id, run)
        repairs = {r["sceneId"]: r["reason"] for r in (cut["review"] or {}).get("repairs", [])}
        scenes = [{"id": s["id"], "heading": s["ja"]["heading"], "narration": s["ja"]["narration"],
                   "issue": repairs.get(s["id"], "")} for s in cut["plan"]["scenes"]]
        return {"cutId": digest, "reviewed": cut["review"] is not None, "title": cut["plan"]["titles"]["ja"], "scenes": scenes}

    def cut_excerpt(self, case_id, run, data):
        from film_preview import render_excerpt
        folder, digest, cut = self._saved_cut(case_id, run)
        if required(data, "cutId", 64) != digest:
            raise ValueError("保存稿が更新されました。場面一覧を開き直してください。")
        scene_id = required(data, "sceneId", 50)
        scenes = cut["plan"]["scenes"]
        index = next((i for i, scene in enumerate(scenes) if scene["id"] == scene_id), None)
        if index is None:
            raise ValueError("この保存稿にある場面を選んでください。")
        clip = render_excerpt(folder, cut["plan"], index)
        return {"sceneId": scene_id, "video": f"/media/{case_id}/{run}/cut-previews/{clip.name}"}

    def cut_media(self, case_id, run, name):
        if not re.fullmatch(r"[a-f0-9]{64}\.mp4", name):
            raise KeyError(name)
        folder, _ = self._cut_run(case_id, run, paused=False)
        return folder / "cut-previews" / name

    def author_commission(self, case_id, run, lang, stage):
        from author_files import read_text
        if lang not in LANGS or stage not in ("draft", "film") or not all(
                re.fullmatch("[0-9a-f]{32}", key) for key in (case_id, run)):
            raise KeyError(run)
        with self.db() as db:
            row = db.execute("SELECT langs FROM runs WHERE case_id=? AND id=? AND production_mode=?",
                             (case_id, run, CODEX_FILM)).fetchone()
        if not row or lang not in json.loads(row["langs"]):
            raise KeyError(run)
        folder = self.folder / "cases" / case_id / run
        record = json.loads(read_text(folder, folder / "author" / f"{lang}-{stage}-commission.json", 4 * 1024 * 1024))
        return {key: record[key] for key in ("model", "effort", "identity", "request", "brief", "prompt") if key in record}

    def media(self, case_id, run, lang, name):
        if lang not in LANGS or name not in ("video.mp4", "subtitles.srt", "contact-sheet.png", "storyboard.jpg"):
            raise KeyError(name)
        if case_id == REFERENCE and run == "reference":
            if name not in ("video.mp4", "subtitles.srt"):
                raise KeyError(name)
            if name == "video.mp4":
                return PILOT / ("walkman-pilot.mp4" if lang == "ja" else "walkman-pilot.en.mp4")
            return PILOT / f"walkman.{lang}.srt"
        if not re.fullmatch("[a-f0-9]{32}", case_id) or not re.fullmatch("[a-f0-9]{32}", run):
            raise KeyError(run)
        with self.db() as db:
            row = db.execute("SELECT editions,plan IS NOT NULL AS planned FROM runs WHERE case_id=? AND id=?", (case_id, run)).fetchone()
        if name == "storyboard.jpg":
            path = self.folder / "cases" / case_id / run / name
            if row and row["planned"] and lang == "ja" and path.is_file():
                return path
            raise KeyError(name)
        if not row or lang not in json.loads(row["editions"]):
            raise KeyError(lang)
        return self.folder / "cases" / case_id / run / lang / name
