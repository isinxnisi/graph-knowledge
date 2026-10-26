"""Bounded read-only Wikidata acquisition. Existing cache means zero HTTP calls.
No credentials, DB, Worker, public import schema or AI calls. Python 3 stdlib.
"""
import gzip, json, hashlib, datetime, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "evidence"
UA = "PlunodeFilmResearch/0.1 (bounded research; https://github.com/isinxnisi/graph-knowledge)"
TITLES = ["Blade Runner", "Blade Runner 2049", "Dune (1984 film)", "Dune (2021 film)",
          "Arrival (film)", "Inception", "Interstellar (film)", "A Fistful of Dollars",
          "Unforgiven", "Million Dollar Baby"]
PROPERTIES = ["P31","P57","P161","P58","P86","P344","P162","P144","P179","P155","P156","P577","P495","P364","P136"]

def acquire(key, params):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / (key + (".json.gz" if key == "films" else ".json"))
    if path.exists():
        return json.loads(gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes())
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params | {"format":"json"})
    req = urllib.request.Request(url, headers={"User-Agent":UA})
    with urllib.request.urlopen(req, timeout=45) as response:
        raw = response.read()
        data = json.loads(raw)
    if "error" in data:
        raise RuntimeError(data["error"])
    record = {"url":url,"accessed_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "license":"CC0-1.0","response_sha256":hashlib.sha256(raw).hexdigest(),"data":data}
    payload = (json.dumps(record,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
    path.write_bytes(gzip.compress(payload,mtime=0) if path.suffix == ".gz" else payload)
    time.sleep(0.5)
    return record

def main():
    films = acquire("films", {"action":"wbgetentities","sites":"enwiki","titles":"|".join(TITLES),
                    "props":"info|labels|descriptions|aliases|claims","languages":"en|ja","redirects":"yes"})
    entities = films["data"]["entities"]
    assert len(entities)==10 and all("missing" not in e for e in entities.values())
    refs=set()
    for q,e in entities.items():
        print(q,e["labels"].get("en"),e["descriptions"].get("en"))
        for p in PROPERTIES:
            for s in e.get("claims",{}).get(p,[]):
                v=s["mainsnak"].get("datavalue",{}).get("value")
                if isinstance(v,dict) and "id" in v: refs.add(v["id"])
    # Labels only, not recursive film/cast collection.
    refs=sorted(refs-set(entities))
    assert len(refs)<=500, "Stop rather than expand the sample"
    for i in range(0,len(refs),50):
        acquire(f"labels-{i//50:02}",{"action":"wbgetentities","ids":"|".join(refs[i:i+50]),
            "props":"info|labels|descriptions|aliases","languages":"en|ja","redirects":"yes"})
    print("film targets:",len(entities),"label-only referenced entities:",len(refs))
if __name__=="__main__": main()
