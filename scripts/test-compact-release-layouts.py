#!/usr/bin/env python3
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import subprocess
import tarfile
import unittest
from unittest.mock import patch

from compact_release_layouts import PENDING, compact, digest


class ReleaseLayoutTest(unittest.TestCase):
    def setUp(self):
        hold = patch('compact_release_layouts.assert_held')
        self.assert_held = hold.start()
        self.addCleanup(hold.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.stage = Path(self.tmp.name)
        self.layout = self.stage / 'image-layout'
        blob = hashlib.sha256(b'layer').hexdigest()
        for name, value in [('index.json', b'{}'), ('manifest.json', b'[]'),
                            ('oci-layout', b'{}'), (f'blobs/sha256/{blob}', b'layer')]:
            file = self.layout / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(value)
        self.archive = self.stage / 'images.tar.gz'
        self.pack()

    def pack(self, extra=None):
        with tarfile.open(self.archive, 'w:gz') as stream:
            for file in sorted(self.layout.rglob('*')):
                if file.is_file():
                    stream.add(file, arcname=file.relative_to(self.layout), recursive=False)
            if extra:
                stream.addfile(extra, io.BytesIO(b''))
        self.checksum = digest(self.archive)
        manifest = self.stage / 'manifest.json'
        manifest.write_text(json.dumps({'archive': {'file': self.archive.name, 'sha256': self.checksum,
                                                    'bytes': self.archive.stat().st_size}}))
        (self.stage / 'RELEASE-SHA256SUMS').write_text(
            f'{self.checksum}  images.tar.gz\n{digest(manifest)}  manifest.json\n')

    def run_compact(self, apply=True):
        return compact(self.stage, self.checksum, token='fixture-hold' if apply else None)

    def test_dry_run_remove_and_repeat(self):
        archive_bytes = self.archive.read_bytes()
        raw = self.stage / 'docker-images.tar'
        raw.write_bytes(b'unique raw image')
        self.assertEqual(self.run_compact(False)[0], 'verified')
        self.assertTrue(self.layout.exists())
        self.assertEqual(self.run_compact()[0], 'removed')
        self.assertEqual(self.run_compact(), ('absent', 0))
        self.assertEqual(self.archive.read_bytes(), archive_bytes)
        self.assertEqual(raw.read_bytes(), b'unique raw image')
        self.layout.mkdir()
        subprocess.run(['tar', '-xzf', str(self.archive), '-C', str(self.layout)], check=True)
        self.assertEqual(self.run_compact(False)[0], 'verified')

    def test_expired_hold_leaves_layout(self):
        self.assert_held.side_effect = RuntimeError('expired')
        with self.assertRaises(RuntimeError):
            self.run_compact()
        self.assertTrue(self.layout.is_dir())

    def test_seal_and_archive_damage(self):
        seal = self.stage / 'RELEASE-SHA256SUMS'
        saved = seal.read_bytes()
        seal.write_bytes(b'')
        with self.assertRaises(ValueError):
            self.run_compact()
        seal.write_bytes(saved)
        self.archive.write_bytes(self.archive.read_bytes() + b'extra')
        with self.assertRaises(ValueError):
            self.run_compact()
        self.assertTrue(self.layout.is_dir())

    def test_changed_missing_and_extra_files(self):
        file = self.layout / 'index.json'
        original = file.stat()
        file.write_bytes(b'xx')
        os.utime(file, ns=(original.st_atime_ns, original.st_mtime_ns))
        with self.assertRaisesRegex(ValueError, 'File contents differ'):
            self.run_compact()
        file.unlink()
        with self.assertRaises(ValueError):
            self.run_compact()
        file.write_bytes(b'{}')
        self.pack()
        (self.layout / 'notes').write_text('keep')
        with self.assertRaises(ValueError):
            self.run_compact()
        self.assertEqual((self.layout / 'notes').read_text(), 'keep')

    def test_dangerous_tar_members(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('oci-layout', tarfile.REGTYPE),
                           ('blobs/sha256/' + 'f' * 64, tarfile.SYMTYPE)]:
            with self.subTest(name=name):
                member = tarfile.TarInfo(name)
                member.type = kind
                self.pack(member)
                with self.assertRaises(ValueError):
                    self.run_compact()
                self.assertTrue(self.layout.is_dir())

    def test_symlink_and_busy_file(self):
        with (self.layout / 'index.json').open('rb'):
            with self.assertRaisesRegex(ValueError, 'In use'):
                self.run_compact()
        file = self.layout / 'index.json'
        file.unlink()
        file.symlink_to(self.stage / 'manifest.json')
        with self.assertRaises(ValueError):
            self.run_compact()
        self.assertTrue(file.is_symlink())

    def test_interrupted_removal_rechecks_remainder(self):
        pending = self.stage / PENDING
        self.layout.rename(pending)
        (pending / 'index.json').unlink()
        foreign = pending / 'keep.txt'
        foreign.write_text('retain')
        with self.assertRaises(ValueError):
            self.run_compact()
        self.assertTrue(foreign.exists())
        foreign.unlink()
        self.assertEqual(self.run_compact()[0], 'removed')
        self.assertFalse(pending.exists())


if __name__ == '__main__':
    unittest.main()
