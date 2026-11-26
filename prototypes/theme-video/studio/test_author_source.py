from email.message import Message
from io import BytesIO
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

from author_source import source_service
from source_transport import fetch, get_pinned, source_url


def response(status, mime, body=b"", **extra):
    res = Mock(status=status)
    res.headers = Message()
    res.headers["Content-Type"] = mime
    for key, value in extra.items():
        res.headers[key] = value
    res.getheader = res.headers.get
    res.read = BytesIO(body).read
    return Mock(), res


class ReferenceTest(unittest.TestCase):
    def test_connection_uses_the_checked_ip_and_verifies_tls_for_the_publisher(self):
        addr = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))
        with patch("source_transport.socket.getaddrinfo", return_value=[addr]) as dns, \
             patch("source_transport.http.client.HTTPSConnection") as tls, patch("source_transport.socket.socket") as sock:
            connection, _ = get_pinned("https://museum.example/img?figure=3")
            connection._create_connection(("museum.example", 443), 8)
            self.assertEqual(tls.call_args.args, ("museum.example",))
            sock.return_value.connect.assert_called_once_with(("8.8.8.8", 443))
            self.assertTrue(tls.call_args.kwargs["context"].check_hostname)
            self.assertEqual(dns.call_count, 1)
            self.assertEqual(connection.request.call_args.args, ("GET", "/img?figure=3"))
            self.assertNotIn("Cookie", connection.request.call_args.kwargs["headers"])

    def test_every_address_and_every_redirect_must_be_public_https(self):
        for value in ("file:///tmp/asset", "https://name:secret@example.org/", "https://example.org:8010/",
                      "https://example.org\\@localhost/image", "http://example.org/"):
            with self.subTest(url=value), self.assertRaises(ValueError):
                source_url(value)
        addresses = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443)) for ip in ("8.8.8.8", "10.0.0.2")]
        with patch("source_transport.socket.getaddrinfo", return_value=addresses), \
             patch("source_transport.http.client.HTTPSConnection") as tls, self.assertRaisesRegex(ValueError, "公開"):
            get_pinned("https://museum.example/image")
        tls.assert_not_called()
        first = response(302, "text/html", Location="https://127.0.0.1/private")
        with patch("source_transport.get_pinned", side_effect=lambda u: first if "museum" in u else get_pinned(u)), \
             patch("source_transport.http.client.HTTPSConnection") as tls, self.assertRaisesRegex(ValueError, "公開"):
            fetch("https://museum.example/image", 1024)
        tls.assert_not_called()

    def test_article_returns_media_candidates_and_limits_apply_to_streamed_bytes(self):
        host = "https://museum.example/articles/1"
        page = b'<img src="/images/coin.png" alt="Front"><video src="../clips/hand.mp4"></video>'
        with patch("source_transport.get_pinned", return_value=response(200, "text/html", page)):
            meta, data = fetch(host, 4096)
        self.assertEqual(meta["extension"], "links.json")
        self.assertEqual(json.loads(data), [
            {"url": "https://museum.example/images/coin.png", "label": "Front"},
            {"url": "https://museum.example/clips/hand.mp4", "label": ""}])
        for invalid in (response(200, "image/jpeg", b"x" * 70), response(200, "application/zip", b"x"),
                        response(200, "video/mp4", b"abc", **{"Content-Length": "80"}),
                        response(200, "image/png", b"x", **{"Content-Encoding": "gzip"})):
            with patch("source_transport.get_pinned", return_value=invalid), self.assertRaises(ValueError):
                fetch(host, 65)

    def test_author_command_gets_a_local_copy_and_repeat_uses_that_copy(self):
        url = "https://museum.example/scan.pdf"
        blob = b"%PDF-1.4\n"
        meta = {"url": url, "mime": "application/pdf", "extension": "pdf"}
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            script = work / "fetch_reference.py"
            shutil.copyfile(Path(__file__).with_name("author_fetch.py"), script)
            with patch("author_source.download", return_value=(meta, blob)) as get, source_service(work):
                for _ in range(2):
                    result = subprocess.run([sys.executable, "-B", "-X", "utf8", str(script), url],
                                            capture_output=True, check=True, timeout=12)
                    row = json.loads(result.stdout)
                    self.assertEqual(row["url"], url)
                    self.assertEqual((work / row["file"]).read_bytes(), blob)
            get.assert_called_once()


if __name__ == "__main__":
    unittest.main()
