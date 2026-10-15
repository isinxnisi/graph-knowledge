#!/usr/bin/env python3
"""Refresh the local Japan-only advertising country table (no visitor lookup API)."""
import argparse
import csv
import gzip
import hashlib
import io
import ipaddress
import json
from pathlib import Path
import re
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("release", help="DB-IP monthly release, YYYY-MM")
parser.add_argument("--archive", type=Path, help="Use a previously downloaded official CSV.gz")
args = parser.parse_args()
if not re.fullmatch(r"\d{4}-(?:0[1-9]|1[0-2])", args.release):
    parser.error("release must be YYYY-MM")
url = f"https://download.db-ip.com/free/dbip-country-lite-{args.release}.csv.gz"
if args.archive:
    archive = args.archive.read_bytes()
else:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://db-ip.com/db/download/ip-to-country-lite"})
    with urllib.request.urlopen(request, timeout=60) as response:
        archive = response.read()
groups = {4: [], 6: []}
for first, last, country in csv.reader(io.StringIO(gzip.decompress(archive).decode())):
    if country != "JP":
        continue
    start, end = ipaddress.ip_address(first), ipaddress.ip_address(last)
    if start.version != end.version or int(start) > int(end):
        raise ValueError("Invalid source range")
    groups[start.version].append((int(start), int(end)))
result = {"release": args.release, "source": url, "sha256": hashlib.sha256(archive).hexdigest(),
          "attribution": "IP Geolocation by DB-IP (https://db-ip.com)",
          "license": "https://creativecommons.org/licenses/by/4.0/", "derivation": "Japan ranges only; adjacent ranges merged"}
for version, ranges in groups.items():
    merged = []
    for start, end in sorted(ranges):
        if merged and start <= merged[-1][1] + 1:
            merged[-1][1] = max(end, merged[-1][1])
        else:
            merged.append([start, end])
    if not merged:
        raise ValueError("Source has no Japan ranges")
    digits = 8 if version == 4 else 32
    result[f"ipv{version}"] = [[f"{start:0{digits}x}", f"{end:0{digits}x}"] for start, end in merged]
target = Path(__file__).resolve().parents[1] / "data/advertising/japan-ranges.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
print(json.dumps({"release": args.release, "ipv4Ranges": len(result["ipv4"]), "ipv6Ranges": len(result["ipv6"]), "bytes": target.stat().st_size}))
