"""Pinned, anonymous HTTPS GET for a filmmaker's public visual references."""
from html.parser import HTMLParser
import http.client
import ipaddress
import json
import re
import socket
import ssl
import sys
from urllib.parse import quote, urljoin, urlsplit, urlunsplit


MIB = 1024 * 1024
MEDIA = {"image/jpeg": ("jpg", 12), "image/png": ("png", 12), "image/gif": ("gif", 12),
         "image/webp": ("webp", 12), "application/pdf": ("pdf", 12), "video/mp4": ("mp4", 24),
         "video/webm": ("webm", 24), "text/html": ("links.json", 2), "application/xhtml+xml": ("links.json", 2)}
MAX_FILE = 24 * MIB


def public_address(value):
    addr = ipaddress.ip_address(value)
    if not addr.is_global or addr.is_multicast or addr.is_reserved:
        return False
    if addr.version == 4:
        # Python versions disagree about the global status of these special-purpose blocks.
        return not (addr in ipaddress.ip_network("192.0.0.0/24") or addr in ipaddress.ip_network("192.88.99.0/24"))
    return (addr in ipaddress.ip_network("2000::/3") and addr not in ipaddress.ip_network("2001::/23")
            and addr not in ipaddress.ip_network("2002::/16"))


def source_url(raw):
    if not isinstance(raw, str) or len(raw) > 8192 or re.search(r"[\x00-\x20\x7f\\]", raw):
        raise ValueError("公開資料のHTTPS URLを指定してください。")
    url = urlsplit(raw)
    host = (url.hostname or "").encode("idna").decode("ascii")
    if (url.scheme != "https" or url.username is not None or url.password is not None or url.port not in (443, None)
            or len(host) > 253 or host.endswith(".") or not re.fullmatch(r"[a-zA-Z0-9.:-]+", host)):
        raise ValueError("認証不要の公開HTTPS URL（443番）を指定してください。")
    authority = f"[{host}]" if ":" in host else host
    return urlunsplit(("https", authority, quote(url.path or "/", safe="/%:@!$&'()*+,;=-._~"),
                       quote(url.query, safe="/%?:@!$&'()*+,;=-._~"), ""))


def get_pinned(url):
    parts = urlsplit(url)
    addresses = socket.getaddrinfo(parts.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not public_address(sockaddr[0]) for *_, sockaddr in addresses):
        raise ValueError("公開インターネットの資料だけを取得できます。")
    family, kind, proto, _, sockaddr = min(addresses, key=lambda x: x[0] != socket.AF_INET)

    def connect_pinned(_host_port, timeout, _source_address=None):
        sock = socket.socket(family, kind, proto)
        try:
            sock.settimeout(timeout)
            sock.connect(sockaddr)
            return sock
        except BaseException:
            sock.close()
            raise

    connection = http.client.HTTPSConnection(parts.hostname, timeout=8, context=ssl.create_default_context())
    # TLS verifies the original server name. The TCP connection uses only the checked numeric address.
    connection._create_connection = connect_pinned
    try:
        connection.request("GET", parts.path + ("?" + parts.query if parts.query else ""), headers={
            "User-Agent": "Plunode-SourceCheck/1.0 (+https://plunode.net/privacy)",
            "Accept": ", ".join(MEDIA), "Accept-Encoding": "identity", "Connection": "close"})
        return connection, connection.getresponse()
    except BaseException:
        connection.close()
        raise


class MediaLinks(HTMLParser):
    def __init__(self, url):
        super().__init__()
        self.url = url
        self.links = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        candidates = []
        if tag in ("img", "source", "video"):
            candidates = [attrs.get(name) for name in ("src", "data-src", "poster")]
            candidates += [item.split()[0] for item in (attrs.get("srcset") or "").split(",") if item.strip()]
        elif tag == "meta" and (attrs.get("property") or attrs.get("name")) in (
                "og:image", "og:image:url", "og:video", "og:video:url", "twitter:image"):
            candidates = [attrs.get("content")]
        elif tag == "a" and re.search(r"\.(png|jpe?g|gif|webp|pdf|mp4|webm)(?:[?#]|$)", attrs.get("href") or "", re.I):
            candidates = [attrs.get("href")]
        for value in candidates:
            if value and len(self.links) < 120:
                try:
                    link = source_url(urljoin(self.url, value))
                except (ValueError, UnicodeError):
                    continue
                self.links.setdefault(link, (attrs.get("alt") or attrs.get("title") or "")[:160])


def fetch(url, capacity):
    url = source_url(url)
    for attempt in range(4):
        connection, response = get_pinned(url)
        try:
            if response.status in (301, 302, 303, 307, 308):
                target = response.getheader("Location")
                if not target or attempt == 3:
                    raise ValueError("公開資料の転送先を確認できません。")
                url = source_url(urljoin(url, target))
                continue
            if response.status != 200:
                raise ValueError(f"掲載元から取得できませんでした（HTTP {response.status}）。")
            mime = response.headers.get_content_type()
            if mime not in MEDIA or response.getheader("Content-Encoding", "identity").lower() != "identity":
                raise ValueError("画像・PDF・MP4・WebM、またはそれらを掲載するHTMLを指定してください。")
            extension, megabytes = MEDIA[mime]
            limit = min(megabytes * MIB, capacity)
            declared = response.getheader("Content-Length")
            if declared is not None and not (declared.isascii() and declared.isdecimal() and int(declared) <= limit):
                raise ValueError("資料が取得できる大きさを超えています。")
            body = response.read(limit + 1)
            if len(body) > limit or not body or (declared is not None and len(body) != int(declared)):
                raise ValueError("資料のサイズが許容範囲にありません。")
            if extension == "links.json":
                parser = MediaLinks(url)
                charset = response.headers.get_content_charset() or "utf-8"
                try:
                    page = body.decode(charset, errors="replace")
                except LookupError:
                    page = body.decode("utf-8", errors="replace")
                parser.feed(page)
                body = json.dumps([{"url": u, "label": label} for u, label in parser.links.items()],
                                  ensure_ascii=False, indent=2).encode()
            return {"url": url, "mime": mime, "extension": extension}, body
        finally:
            connection.close()


def main():
    try:
        request = json.loads(sys.stdin.buffer.read(24000))
        meta, body = fetch(request["url"], min(MAX_FILE, int(request["capacity"])))
        sys.stdout.buffer.write(json.dumps(meta, ensure_ascii=True).encode() + b"\n" + body)
    except (ValueError, OSError, http.client.HTTPException, UnicodeError) as error:
        sys.stderr.buffer.write(str(error)[:250].encode("utf-8", errors="replace"))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
