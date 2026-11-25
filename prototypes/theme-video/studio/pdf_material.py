"""Extract page text from an already downloaded PDF. This worker receives bytes, never URLs."""
import base64
import hashlib
from importlib.util import find_spec
from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
import sys
import unicodedata


def windows_pdf_library():
    """Resolve the optional pure-Python reader before the Windows studio enters WSL."""
    if os.name != "nt":
        return ""
    installed = find_spec("pypdf")
    if installed and installed.origin:
        return str(Path(installed.origin).parents[1])
    import winreg
    registry = r"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages"
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, registry) as packages:
            names = sorted((winreg.EnumKey(packages, i) for i in range(winreg.QueryInfoKey(packages)[0])), reverse=True)
            for name in names:
                if name.startswith("OpenAI.CodexPrimaryRuntime."):
                    with winreg.OpenKey(packages, name) as package:
                        install, _ = winreg.QueryValueEx(package, "PackageRootFolder")
                    site = Path(install) / "dependencies/python/Lib/site-packages"
                    if (site / "pypdf/__init__.py").is_file():
                        return str(site)
    except OSError:
        pass
    return ""


def extract_pages(body, library):
    if not body.startswith(b"%PDF-") or len(body) > 2_000_000:
        raise ValueError("取得した本文は照合できる形式・サイズのPDFではありません。")
    reader = library.PdfReader(BytesIO(body))
    if reader.is_encrypted:
        raise ValueError("暗号化PDFのため、原文を照合できませんでした。")
    if len(reader.pages) > 300:
        raise ValueError("PDFが300ページを超え、本文を照合できませんでした。")
    pages = []
    length = 0
    for page in reader.pages:
        text = page.extract_text() or ""
        length += len(text.encode("utf-8"))
        if length > 2_000_000:
            raise ValueError("PDFから取り出した本文が照合できる上限を超えました。")
        pages.append(text)
    if not any(page.strip() for page in pages):
        raise ValueError("PDFに抽出可能な文字がありません。スキャン画像からの引用は確認できません。")
    return pages


def match_excerpts(body, pages, excerpts, version):
    def normalize(value):
        return " ".join(unicodedata.normalize("NFKC", value).split())

    def digest(value):
        return hashlib.sha256(value).hexdigest()

    normalized = [normalize(page) for page in pages]
    shared = {"extractor": "studio-pdf-text-v1/pypdf-" + version, "bodySha256": digest(body),
              "textSha256": digest("\f".join(normalized).encode()), "pageCount": len(pages)}
    results = []
    for excerpt in excerpts:
        quote = normalize(excerpt)
        numbers = [i for i, page in enumerate(normalized, 1) if quote and quote in page]
        if not numbers:
            results.append({"error": "同じPDFページの抽出本文に引用が一致しません。綴りや改行位置を原資料で確認してください。"})
            continue
        page = normalized[numbers[0] - 1]
        at = page.index(quote)
        locator = "PDFファイルの" + "・".join(map(str, numbers)) + "ページ"
        results.append({"proof": {**shared, "pages": numbers, "excerptSha256": digest(quote.encode())},
                        "locator": locator, "context": page[max(0, at - 420):at + len(quote) + 420]})
    return results


def main():
    if sys.platform.startswith("linux"):
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024**2, 512 * 1024**2))
        resource.setrlimit(resource.RLIMIT_CPU, (12, 14))
    try:
        if len(sys.argv) > 1 and sys.argv[1]:
            folder = sys.argv[1]
            if os.name != "nt":
                folder = subprocess.check_output(["wslpath", "-u", folder], text=True, timeout=3).strip()
            sys.path.append(folder)
        import pypdf
    except (ImportError, OSError, subprocess.SubprocessError):
        result = {"error": "この環境にはPDF本文照合用のpypdfがありません。"}
    else:
        try:
            request = json.load(sys.stdin.buffer)
            body = base64.b64decode(request["body"], validate=True)
            pages = extract_pages(body, pypdf)
            result = {"matches": match_excerpts(body, pages, request["excerpts"], pypdf.__version__)}
        except ValueError as exc:
            result = {"error": str(exc)}
        except Exception:
            result = {"error": "PDFの本文を展開できませんでした。別の公開原資料を確認してください。"}
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    main()
