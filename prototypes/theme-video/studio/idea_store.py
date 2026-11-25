"""Durable pitches and their source editions in the local production ledger."""
import json
import uuid


SCHEMA = """
    CREATE TABLE IF NOT EXISTS idea_batches(
        id TEXT PRIMARY KEY, theme_id TEXT NOT NULL, revision INTEGER NOT NULL,
        theme_title TEXT NOT NULL, snapshot TEXT NOT NULL, brief TEXT NOT NULL,
        model TEXT NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL, error TEXT);
    CREATE INDEX IF NOT EXISTS batches_by_theme ON idea_batches(theme_id, created);
    CREATE TABLE IF NOT EXISTS ideas(
        id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES idea_batches(id),
        title TEXT NOT NULL, opening TEXT NOT NULL, payoff TEXT NOT NULL, needs TEXT NOT NULL,
        source_ids TEXT NOT NULL, created TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('candidate','later','used')),
        case_id TEXT UNIQUE REFERENCES cases(id),
        CHECK ((status='used') = (case_id IS NOT NULL)));
    CREATE INDEX IF NOT EXISTS ideas_by_batch ON ideas(batch_id);
"""


def list_batches(db, theme):
    return [dict(r) for r in db.execute("""
        SELECT b.id,b.theme_id themeId,b.revision,b.theme_title themeTitle,b.model,b.created,b.status,b.error,
               (SELECT count(*) FROM ideas WHERE batch_id=b.id) count
        FROM idea_batches b WHERE (? IS NULL OR b.theme_id=?) ORDER BY b.created DESC,b.rowid DESC
        """, (theme, theme))]


def list_items(db, theme, reference):
    items = []
    for row in db.execute("""
            SELECT i.id,b.theme_id themeId,b.revision,b.theme_title themeTitle,i.title,i.opening,i.payoff,
                   i.needs,i.source_ids sourceIds,i.status,i.case_id caseId,i.created,i.batch_id batchId,
                   (SELECT json_group_array(json_object('id',p.value,'title',json_extract(s.value,'$.title'),
                                                        'url',json_extract(s.value,'$.url')))
                    FROM json_each(i.source_ids) p JOIN json_each(b.snapshot,'$.sources') s
                    ON json_extract(s.value,'$.id')=p.value) sources
            FROM ideas i JOIN idea_batches b ON b.id=i.batch_id
            WHERE (? IS NULL OR b.theme_id=?) ORDER BY b.created DESC,b.rowid DESC,i.rowid
            """, (theme, theme)):
        items.append({**dict(row), "sourceIds": json.loads(row["sourceIds"]), "sources": json.loads(row["sources"]),
                      "origin": "generated"})
    # Earlier productions have no saved pitch. Only show an actual rendered edition as
    # past work; a failed draft or a queued request is not a decision to use an idea.
    for row in db.execute("""
            SELECT c.id caseId, json_extract(c.snapshot,'$.themeId') themeId,
                   json_extract(c.snapshot,'$.revision') revision, c.title themeTitle,
                   coalesce(json_extract(r.plan,'$.titles.ja'),c.title) title,
                   coalesce(json_extract(r.plan,'$.story.explanation'),c.brief) payoff, r.created
            FROM cases c JOIN runs r ON r.id=(
                SELECT j.id FROM runs j WHERE j.case_id=c.id AND j.plan IS NOT NULL AND
                (json_type(j.editions,'$.ja') IS NOT NULL OR json_type(j.editions,'$.en') IS NOT NULL)
                ORDER BY j.created,j.rowid LIMIT 1)
            WHERE NOT EXISTS (SELECT 1 FROM ideas i WHERE i.case_id=c.id)
              AND (? IS NULL OR json_extract(c.snapshot,'$.themeId')=?)
            """, (theme, theme)):
        items.append({**dict(row), "id": "previous-" + row["caseId"], "opening": "", "needs": "",
                      "sourceIds": [], "sources": [], "status": "used", "batchId": None, "origin": "previous"})
    if theme is None or theme == reference["themeId"]:
        items.append({"id": "previous-" + reference["id"], "caseId": reference["id"],
                      "themeId": reference["themeId"], "revision": reference["revision"],
                      "themeTitle": reference["themeTitle"], "title": reference["title"], "opening": "",
                      "payoff": reference["brief"], "needs": "", "status": "used", "origin": "reference",
                      "created": reference["updated"], "batchId": None, "sourceIds": [], "sources": []})
    return sorted(items, key=lambda item: item["created"], reverse=True)


def selected(db, idea_id):
    row = db.execute("""SELECT i.*,b.snapshot,b.theme_id,b.revision FROM ideas i
                        JOIN idea_batches b ON b.id=i.batch_id WHERE i.id=?""", (idea_id,)).fetchone()
    if not row:
        raise KeyError(idea_id)
    return row


def production_brief(idea):
    lines = ["仮題　" + idea["title"], "冒頭　" + idea["opening"], "見終えたときの発見　" + idea["payoff"]]
    if idea["needs"]:
        lines.append("要確認の根拠・素材　" + idea["needs"])
    ids = json.loads(idea["source_ids"])
    sources = "この案の参照資料　" + "、".join(ids)
    brief = "\n".join(lines)
    if ids and len(brief) + len(sources) + 1 <= 1800:
        brief += "\n" + sources
    return brief


def save_generated(db, batch, cards, now):
    if not isinstance(cards, list):
        raise ValueError("動画案の一覧を確認できません。")
    source_ids = {s["id"] for s in json.loads(batch["snapshot"]).get("sources", [])}
    previous = db.execute("""
        SELECT i.title,i.opening,i.payoff FROM ideas i JOIN idea_batches b ON b.id=i.batch_id
        WHERE b.theme_id=? AND b.revision=?
        """, (batch["theme_id"], batch["revision"]))
    known = {tuple(row) for row in previous}
    for card in cards:
        if not isinstance(card, dict):
            raise ValueError("動画案の内容を確認できません。")
        fields = []
        for field, limit in (("title", 120), ("opening", 450), ("payoff", 450), ("needs", 450)):
            value = card.get(field)
            if not isinstance(value, str) or len(value) > limit or (field != "needs" and not value.strip()):
                raise ValueError("動画案の仮題・導入・発見・必要資料を確認してください。")
            fields.append(value.strip())
        ids = card.get("sourceIds")
        if (not isinstance(ids, list) or any(not isinstance(s, str) or s not in source_ids for s in ids)
                or not ids and not fields[3]):
            raise ValueError("動画案の参照資料または追加で必要な根拠を確認してください。")
        signature = tuple(fields[:3])
        if signature in known:
            continue
        known.add(signature)
        db.execute("""INSERT INTO ideas(id,batch_id,title,opening,payoff,needs,source_ids,created,status)
                      VALUES(?,?,?,?,?,?,?,?,'candidate')""",
                   (uuid.uuid4().hex, batch["id"], *fields, json.dumps(list(dict.fromkeys(ids))), now))
