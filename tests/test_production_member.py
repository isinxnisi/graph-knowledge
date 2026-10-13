import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("member_prepare", Path(__file__).parents[1] / "scripts/prepare-production-member.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ProductionMemberPreparation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base, self.google, self.output = [Path(self.temp.name) / name for name in ["base.env", "google.json", "candidate.env"]]
        self.base.write_text("NEO4J_PASSWORD=unchanged\nGRAPH_IMAGE_TAG=previous\n")
        self.data = {"web": {"client_id": "test.apps.googleusercontent.com", "client_secret": "test-only-google-secret", "redirect_uris": [module.CALLBACK]}}
        self.write_google()
        self.base.chmod(0o600)

    def write_google(self):
        self.google.write_text(json.dumps(self.data))
        self.google.chmod(0o600)

    def run_prepare(self):
        module.prepare(self.base, self.google, self.output, "test-step13")

    def test_candidate_only_and_private(self):
        previous = self.base.read_text()
        self.run_prepare()
        self.assertEqual(self.base.read_text(), previous)
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)
        values = dict(line.split("=", 1) for line in self.output.read_text().splitlines())
        self.assertEqual(values["NEO4J_PASSWORD"], "unchanged")
        self.assertEqual(values["MEMBER_STORAGE_ENABLED"], "1")
        self.assertIn(values["MEMBER_POSTGRES_PASSWORD"], values["MEMBER_DATABASE_URL"])
        self.assertNotEqual(values["MEMBER_POSTGRES_ADMIN_PASSWORD"], values["MEMBER_POSTGRES_PASSWORD"])

    def test_reuse_secrets_and_no_overwrite(self):
        self.run_prepare()
        with self.assertRaises(FileExistsError):
            self.run_prepare()
        self.base.write_text(self.output.read_text())
        previous = self.output.read_text()
        self.output.unlink()
        self.run_prepare()
        self.assertEqual(self.output.read_text(), previous)

    def test_reject_wrong_redirect_and_non_web_client(self):
        for data in [{"installed": self.data["web"]}, {"web": {**self.data["web"], "redirect_uris": ["https://other.invalid/callback"]}}]:
            self.data = data
            self.write_google()
            with self.assertRaises(ValueError):
                self.run_prepare()
            self.assertFalse(self.output.exists())

    def test_reject_readable_secret_files(self):
        for path in [self.base, self.google]:
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                self.run_prepare()
            path.chmod(0o600)

    def test_reject_silent_rotation_and_wrong_database(self):
        for line in ["MEMBER_GOOGLE_CLIENT_ID=other.apps.googleusercontent.com", "MEMBER_AUTH_SECRET=short", "MEMBER_DATABASE_URL=postgresql://another.invalid/other"]:
            self.base.write_text("NEO4J_PASSWORD=unchanged\n" + line + "\n")
            with self.assertRaises(ValueError):
                self.run_prepare()
            self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
