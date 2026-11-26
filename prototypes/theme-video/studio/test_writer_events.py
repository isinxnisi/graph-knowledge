"""Exercise Codex exec JSONL locally, without making a model request."""
import json
from subprocess import CompletedProcess
import unittest
from unittest.mock import patch

from editor import _call_writer


def item(phase, kind, **fields):
    return {"type": "item." + phase, "item": {"id": "i1", "type": kind, **fields}}


class WriterEventsTest(unittest.TestCase):
    def run_writer(self, *stream, research=False):
        request = {"model": "model", "effort": "high", "prompt": "test", "outputSchema": {}}
        events = [{"type": "thread.started"}, {"type": "turn.started"}, *stream,
                  item("completed", "agent_message", text='{"ok": true}'),
                  {"type": "turn.completed", "usage": {"output_tokens": 3}}]
        result = CompletedProcess([], 0, stdout="\n".join(json.dumps(e) for e in events))
        with patch("editor._run", return_value=result):
            return _call_writer(request, research=research)

    def test_progress_notifications_are_valid_in_both_modes(self):
        notes = [item(phase, "todo_list", items=[{"text": "check the source", "completed": False}])
                 for phase in ("started", "updated", "completed")]
        expected = {"ok": True}, {"output_tokens": 3}
        self.assertEqual(self.run_writer(*notes), expected)
        for action in ("search", "open_page", "find_in_page", "openPage", "findInPage"):
            with self.subTest(action=action):
                search = [item("started", "web_search", query=""),
                          item("completed", "web_search", action={"type": action})]
                self.assertEqual(self.run_writer(*search, *notes, research=True), expected)

    def test_only_completed_web_access_counts_in_research(self):
        for event in (item("completed", "todo_list", items=[]), item("completed", "reasoning"),
                      item("started", "web_search", action={"type": "search"})):
            with self.subTest(event=event), self.assertRaisesRegex(RuntimeError, "ウェブにアクセスした記録"):
                self.run_writer(event, research=True)
        self.assertEqual(self.run_writer(item("completed", "web_search", query="title"), research=True)[0],
                         {"ok": True})

    def test_execution_is_rejected_at_each_phase_and_in_each_mode(self):
        for phase in ("started", "updated", "completed"):
            for kind in ("command_execution", "file_change", "mcp_tool_call", "collab_tool_call", "future_tool"):
                for research in (False, True):
                    with self.subTest(phase=phase, kind=kind, research=research), self.assertRaises(RuntimeError) as exc:
                        self.run_writer(item(phase, kind, command="private command"), research=research)
                    message = str(exc.exception)
                    self.assertIn("item." + phase + " / " + kind, message)
                    self.assertNotIn("private command", message)
            with self.assertRaisesRegex(RuntimeError, "文章生成以外.*web_search"):
                self.run_writer(item(phase, "web_search", action={"type": "open_page"}))

    def test_unknown_event_and_search_actions_leave_only_protocol_identifiers(self):
        for event, expected in (({"type": "future.event"}, "future.event"),
                                (item("completed", "web_search", action={"type": "other"}), "web_search / other"),
                                (item("completed", "web_search", action={"type": "private payload"}), "web_search / unknown"),
                                (item("completed", "web_search", query=""), "web_search / unknown")):
            with self.subTest(event=expected), self.assertRaises(RuntimeError) as exc:
                self.run_writer(event, research=True)
            self.assertIn(expected, str(exc.exception))
            self.assertNotIn("private payload", str(exc.exception))


if __name__ == "__main__":
    unittest.main()
