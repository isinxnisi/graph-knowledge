import json
from pathlib import Path
import tempfile
import unittest

from editor import SOURCE_BACKGROUND_PROMPT, _object, _writer_request
from paper_stage_recovery import paper_stage
from writer_feedback import request_digest


class PaperStageRecoveryTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.records = Path(tmp.name)
        self.name = "04-revision-2"
        self.inputs = {"request": "この資料で比較する", "sources": ["ref-1"], "finalReview": {"ready": False}}
        self.old_instructions = "台本を修正する。"
        self.local = "残る指摘を直す。"
        self.instructions = self.old_instructions + "\n" + SOURCE_BACKGROUND_PROMPT + "\n" + self.local
        scene = {"asset": {"type": "string"}}
        def schema(fields):
            script = _object({"scenes": {"type": "array", "items": _object(fields)}})
            return _object({"script": script})
        self.old_schema = schema(scene)
        self.schema = schema({**scene, "sourceBackground": {"type": ["string", "null"], "enum": [None, "white"]}})

    def request(self, instructions, inputs, schema):
        return _writer_request("model", "ultra", "plunode-video-ja-7", instructions, inputs, schema)

    def save(self, request, result, status="done"):
        digest = request_digest(request)
        path = self.records / f"{self.name}-{digest}.json"
        entry = {"stage": self.name, "request": request, "inputSha256": digest, "status": status,
                 "result": result, "usage": {"input_tokens": 11}}
        path.write_text(json.dumps(entry, ensure_ascii=False), encoding="utf-8")
        return path

    def restore(self, inputs=None, model=None, validate=None):
        inputs = self.inputs if inputs is None else inputs
        current = self.request(self.instructions, inputs, self.schema)
        if model:
            current["model"] = model
        return paper_stage(self.records, self.name, current, self.instructions, inputs, validate or (lambda raw: raw), self.local)

    def test_matching_old_revision_is_read_only_and_scoped_to_original_request(self):
        old = self.request(self.old_instructions, self.inputs, self.old_schema)
        result = {"script": {"scenes": [{"asset": "source"}]}}
        path = self.save(old, result)
        original = path.read_bytes()
        self.assertEqual(self.restore(), (result, old, True, {"input_tokens": 11}))
        for changed in ({"request": "別案"}, {"sources": ["changed"]}, {"finalReview": {"ready": True}}):
            self.assertIsNone(self.restore({**self.inputs, **changed}))
        self.assertIsNone(self.restore(model="other"))
        def invalid(raw):
            raise ValueError("invalid")
        self.assertIsNone(self.restore(validate=invalid))
        self.assertEqual(path.read_bytes(), original)
        self.save(self.request(self.instructions, self.inputs, self.schema), {}, status="running")
        self.assertIsNone(self.restore())

    def test_old_rejection_can_inform_repair_but_never_approve_a_cut_or_describe_white(self):
        self.name = "05-check-2"
        self.instructions = "完成稿を照合する。"
        self.schema = {"type": "object"}
        def inputs(picture):
            return {"cut": {"scenes": [{"id": "s1", "picture": picture}]}}
        old = self.request(self.instructions, inputs("出典資料。中央に資料名"), self.schema)
        current = inputs("出典資料。字幕帯より上の背景は生成りの紙色。中央に資料名")
        self.save(old, {"ready": False})
        self.assertEqual(self.restore(current)[0], {"ready": False})
        self.assertIsNone(self.restore(inputs("出典資料。字幕帯より上の背景は白地。中央に資料名")))
        self.save(old, {"ready": True})
        self.assertIsNone(self.restore(current))
