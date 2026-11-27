"""Only explicit remote verification failures trigger the unverified draft preview."""
import json
from unittest import TestCase
from unittest.mock import MagicMock, Mock, patch

from theme_media_bridge import PlacementProblem, ThemePlacement


class ThemeMediaBridgeTest(TestCase):
    def setUp(self):
        self.bridge = ThemePlacement.__new__(ThemePlacement)
        self.bridge.token = Mock(return_value="test-only")
        self.bridge.read = Mock(return_value={"slots": []})

    def remote(self, status, value):
        response = MagicMock(status_code=status)
        response.iter_content.return_value = [json.dumps(value).encode()]
        response.__enter__.return_value = response
        return patch("requests.request", return_value=response)

    def test_missing_video_configuration_is_distinct_before_save(self):
        body = {"code": "VIDEO_VERIFICATION_UNAVAILABLE", "error": "サイトのYouTube照合設定を確認してください。"}
        with self.remote(503, body):
            with self.assertRaises(PlacementProblem) as preview:
                self.bridge.change("beta", {"action": "preview"})
            with self.assertRaisesRegex(PlacementProblem, "掲載は反映されていません"):
                self.bridge.change("beta", {"action": "save"})
        self.assertEqual(preview.exception.code, body["code"])
        self.assertIn("照合設定が必要", str(preview.exception))
        self.bridge.read.assert_not_called()

    def test_unknown_save_error_keeps_outcome_uncertain(self):
        with self.remote(503, {"code": "MEDIA_UNAVAILABLE"}):
            with self.assertRaisesRegex(RuntimeError, "保存結果を確認") as failure:
                self.bridge.change("beta", {"action": "save"})
        self.assertNotIsInstance(failure.exception, PlacementProblem)
        self.bridge.read.assert_not_called()

    def test_confirmed_save_reports_failed_readback_separately(self):
        self.bridge.read.side_effect = RuntimeError("disconnected")
        with self.remote(200, {"ok": True}):
            with self.assertRaisesRegex(RuntimeError, "保存を受け付けました"):
                self.bridge.change("beta", {"action": "save", "themeId": "theme:1", "revision": 1})
        self.bridge.read.assert_called_once_with("beta", "theme:1", 1)
