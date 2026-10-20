"""Nonprivileged checks of the one-time rollout installer. Never runs root installation."""
import importlib.util
import contextlib
import hashlib
import io
import json
import os
import shutil
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('publication_installer',ROOT/'ops/install-publication-disabled.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)


class InstallerBoundaryTests(unittest.TestCase):
    def test_unprivileged_or_extra_arguments_never_run_system_commands(self):
        for uid,argv in [(1000,['installer']),(0,['installer','--enable'])]:
            with patch.object(p.os,'geteuid',return_value=uid),patch.object(p.sys,'argv',argv),patch.object(p,'run') as command:
                with self.assertRaises(ValueError):p.main()
                command.assert_not_called()

    def test_writes_preserve_existing_and_symlink_targets_and_set_exact_mode(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);existing=root/'existing';existing.write_bytes(b'old')
            link=root/'link';link.symlink_to(existing)
            for path in [existing,link]:
                with self.assertRaises(ValueError):p.write(path,b'new')
            self.assertEqual(existing.read_bytes(),b'old')
            new=root/'new';p.write(new,b'public-only',0o644)
            self.assertEqual(new.read_bytes(),b'public-only');self.assertEqual(new.stat().st_mode&0o777,0o644)
            private=root/'private';p.write(private,b'private');self.assertEqual(private.stat().st_mode&0o777,0o600)

    def test_public_directories_have_exact_mode_under_private_install_umask(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous=os.umask(0o077)
            try:
                for name,mode in [('entry',0o755),('chroot',0o751),('trusted',0o700)]:
                    path=Path(tmp)/name;p.directory(path,mode)
                    self.assertEqual(path.stat().st_mode&0o777,mode)
            finally:os.umask(previous)

    def test_user_writable_staging_cannot_be_a_root_install_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            with self.assertRaises(ValueError):p.secure_tree(folder)
            link=folder/'linked';link.symlink_to(folder,target_is_directory=True)
            with self.assertRaises(ValueError):p.secure_tree(link)

    @unittest.skipUnless(Path('/usr/bin/docker').exists(),'Actual Docker Compose CLI required')
    def test_actual_compose_profile_resolves_ops_without_member_or_daemon(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);compose=root/'compose.yaml';shutil.copyfile(ROOT/'compose.production.yaml',compose)
            env=root/'app.env';env.write_text('NEO4J_PASSWORD=isolated-profile-test-only\nGRAPH_IMAGE_TAG=profile-test\nGRAPH_BACKUP_DIRECTORY=/tmp/unused-profile-test\n')
            old=subprocess.run(['/usr/bin/docker','compose','--env-file',str(env),'-f',str(compose),'config','--format','json'],capture_output=True,check=True)
            import json
            self.assertNotIn('ops',json.loads(old.stdout)['services'])
            # Production run() deliberately sets HOME=/root; this test executes the same argv as the nonroot test owner.
            with patch.object(p,'run',side_effect=lambda argv:subprocess.run(argv,capture_output=True,check=True).stdout):
                current=p.compose_configuration(env,compose)
            self.assertEqual(current['services']['ops']['image'],'graph-knowledge-ops:profile-test')
            self.assertNotIn('graph-member-postgres',current['services'])

    def test_image_store_selects_only_exact_reviewed_identity(self):
        for status,expected in [([],p.IMAGE),([['driver-type','io.containerd.snapshotter.v1']],p.IMAGE_MANIFEST)]:
            with patch.object(p,'run',return_value=json.dumps(status).encode()):self.assertEqual(p.runtime_image_id(),expected)
        with patch.object(p,'run',return_value=b'[["driver-type","unknown"]]'):
            with self.assertRaises(ValueError):p.runtime_image_id()

    def test_config_manifest_layer_chain_and_platform_binding_are_verified(self):
        for drift in [None,'platform','layer','export']:
            config={'os':'windows' if drift=='platform' else 'linux','architecture':'amd64','rootfs':{'diff_ids':['sha256:'+'a'*64]}}
            config_bytes=json.dumps(config).encode();config_id='sha256:'+hashlib.sha256(config_bytes).hexdigest()
            manifest={'config':{'digest':config_id},'layers':[{'digest':'sha256:'+('b' if drift=='layer' else 'a')*64}]}
            manifest_bytes=json.dumps(manifest).encode();manifest_id='sha256:'+hashlib.sha256(manifest_bytes).hexdigest()
            blobs={'config':config_bytes,'blobs/sha256/'+manifest_id.split(':')[1]:manifest_bytes,
                'manifest.json':json.dumps([{'Config':'config','RepoTags':None,'Layers':['blobs/sha256/'+('c' if drift=='export' else 'a')*64]}]).encode()}
            class Archive:
                def extractfile(self,name):return io.BytesIO(blobs[name])
            with patch.object(p,'IMAGE',config_id),patch.object(p,'IMAGE_MANIFEST',manifest_id),patch('tarfile.open',return_value=contextlib.nullcontext(Archive())):
                if drift:
                    with self.assertRaises(ValueError):p.image_identity(Path('synthetic-archive'))
                else:self.assertEqual(p.image_identity(Path('synthetic-archive')),config['rootfs']['diff_ids'])



if __name__=='__main__':unittest.main()
