"""UTC serialization is a producer contract; frozen inputs and validation stay strict."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('recovery_subject', ROOT / 'scripts/collection-recovery.py')
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)


class TimestampRecovery(unittest.TestCase):
    def test_timestamp_preserves_instant_precision_and_requires_timezone(self):
        self.assertEqual(r.issues.fixture_stamp('2026-10-18T18:54:58+00:00'), '2026-10-18T18:54:58Z')
        self.assertEqual(r.issues.fixture_stamp('2026-10-19T03:54:58.123456+09:00'), '2026-10-18T18:54:58.123456Z')
        self.assertEqual(r.issues.fixture_stamp('2026-10-18T18:54:58Z'), '2026-10-18T18:54:58Z')
        for value in ['2026-10-18T18:54:58', 'not-a-date', '2026-02-30T00:00:00Z']:
            with self.assertRaises(ValueError): r.issues.fixture_stamp(value)

    def test_new_recipe_only_changes_utc_representation_and_versioned_paths(self):
        old = r.read(ROOT / 'datasets/manga-collection/r0003/recipe.json')
        old['stamp'] = '2026-10-18T18:54:58+00:00'; frozen = copy.deepcopy(old)
        new = r.transformed_recipe(old, 17)
        self.assertEqual(old, frozen); self.assertEqual(new['stamp'], '2026-10-18T18:54:58Z')
        self.assertEqual({k:v for k,v in old.items() if k not in ['id','stamp','reviewArtifacts']},
                         {k:v for k,v in new.items() if k not in ['id','stamp','reviewArtifacts']})
        with self.assertRaisesRegex(ValueError, 'only repairs'): r.transformed_recipe(new, 18)

    def test_completed_or_unrelated_failures_cannot_be_recovered(self):
        for record in [{'kind':'collect-review','phase':'completed'}, {'kind':'collect-review','phase':'blocked','message':'scope changed'}]:
            with self.assertRaisesRegex(ValueError, 'specific blocked'): r.original(ROOT, r.gate, record)

    def test_original_cancellation_or_hash_change_stops_recovery_monitor(self):
        fixture = r.module('recovery_worker_fixture', ROOT / 'tests/test_collection_worker.py')
        b = fixture.b; store = fixture.MemoryStore(); old = fixture.approval('original')
        store.submit(old); _, sha = store.json(b.PREFIX + 'requests/original.json')
        new = copy.deepcopy(old); new.update(id='recovered', recovery={'predecessorRequestId':'original','predecessorRequestSha256':sha})
        store.submit(new); _, new_sha = store.json(b.PREFIX + 'requests/recovered.json')
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory); worker = b.Worker({'home':directory,'workerId':'test'},store,fixture.FakeExecutor(home),fixture.no_lock)
            worker.active(new,new_sha,sync=False)
            store.files[b.PREFIX+'revocations/original.json']=b'{}'
            with self.assertRaisesRegex(b.Blocked,'Predecessor revoked'): worker.active(new,new_sha,sync=False)
            del store.files[b.PREFIX+'revocations/original.json']
            old['humanDecision']['statement']+=' changed'; store.submit(old)
            with self.assertRaisesRegex(b.Blocked,'record changed'): worker.active(new,new_sha,sync=False)

    def test_real_fixture_schema_reproduces_offset_failure_and_keeps_existing_data(self):
        script = "const fs=require('node:fs');const {fixtureV4Schema}=require('./lib/domain/fixture.ts');" \
            "const base=JSON.parse(fs.readFileSync('datasets/public-kg/releases/20261014-credits-001/data.json','utf8'));" \
            "const changed=structuredClone(base);changed.entities[0].createdAt='2026-10-18T18:54:58+00:00';" \
            "const bad=fixtureV4Schema.safeParse(changed);changed.entities[0].createdAt='2026-10-18T18:54:58Z';" \
            "console.log(JSON.stringify({base:fixtureV4Schema.safeParse(base).success,offset:bad.success," \
            "path:bad.error.issues[0].path,repaired:fixtureV4Schema.safeParse(changed).success}));"
        completed = subprocess.run(['node','--import','tsx','-e',script], cwd=ROOT, capture_output=True, text=True, timeout=120, check=True)
        value = json.loads(completed.stdout)
        self.assertEqual(value, {'base':True, 'offset':False, 'path':['entities',0,'createdAt'], 'repaired':True})


if __name__ == '__main__': unittest.main()
