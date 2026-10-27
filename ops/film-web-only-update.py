#!/usr/bin/python3 -I
"""One-time film Web-only rollout before the separately signed KG publication.
No migration, KG apply, Worker control, signature, flag or credential change.
"""
import copy
import contextlib
import hashlib
import stat
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
import urllib.error

OLD_BUILD = "p2mPLpwWtvRzE54EdYqwS"
NEW_BUILD = "oTXBAgU034CoviTmmAHQ9"
NEW_CONFIG = "sha256:de7b21f30277226965de2fdc7200ba0088fd00f8c9d731958eb52355c92f72ab"
OLD_IMAGES = {"sha256:41b0ec0f3caf76990c2cb67543f642194b773af01c81e6bda78629957bfc41a1",
              "sha256:fdb86ef1d50ef53f31ce09b1900e458f5e8c7385d356e26fb3b233863fc60c4f"}
BASE = "b74a4b00-9454-412f-af5d-1317713a543c"
GRAPH = "509b460f9fc56e414677d5cf4f1a25634ab48171810ac27413461db2914f3da4"
NONCE = "6b240b18-56e4-4ea4-995f-7be7424c3fb2"

def run(args, output=None):
    result = subprocess.run(args, stdout=output or subprocess.PIPE, stderr=subprocess.PIPE, timeout=600)
    if result.returncode:
        raise RuntimeError("Protected Web-only command failed: " + args[0])
    return result.stdout.decode().strip() if result.stdout is not None else ""

def patch_image(text, image):
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", image): raise ValueError("Fixed image required")
    match = re.search(r"^  web:\s*\n", text, re.M)
    if not match: raise ValueError("Existing Web service required")
    end = re.search(r"^(?:  [\w-]+:|[^\s#])", text[match.end():], re.M)
    stop = match.end()+end.start() if end else len(text)
    block = text[match.start():stop]
    if len(re.findall(r"^    image:.*$", block, re.M)) != 1: raise ValueError("Single Web image required")
    block = re.sub(r"^    image:.*$", '    image: "'+image+'"', block, flags=re.M)
    return text[:match.start()]+block+text[stop:]

def expected_config(previous, image):
    value = copy.deepcopy(previous)
    value["services"]["web"]["image"] = image
    return value

@contextlib.contextmanager
def rollback_web_on_failure(compose, path, original, mode, atomic):
    try:
        compose("stop","web")
        yield
    except BaseException:
        atomic(path,original,mode)
        compose("up","-d","--no-deps","--pull","never","--wait","--wait-timeout","180","web")
        raise

def http(path, method="GET", payload=None):
    request = urllib.request.Request("http://127.0.0.1:3200"+path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={"Cache-Control":"no-cache","Content-Type":"application/json"}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response: return response.status, response.read()
    except urllib.error.HTTPError as error: return error.code, error.read()

def smoke():
    status, body = http("/api/dataset")
    if status != 200 or json.loads(body) != {"dataset":"public-kg","revision":BASE}: raise ValueError("Unchanged public KG required")
    status, body = http("/api/member/status")
    if status != 200 or json.loads(body).get("provider") != "google": raise ValueError("Existing Google configuration required")
    if http("/api/member/profile")[0] != 401: raise ValueError("Anonymous member boundary changed")
    request = {"version":2,"dataset":"public-kg","revision":None,"after":None,"criteria":{
        "q":"許されざる者","kind":"work","nameTarget":"subject","relation":{
            "version":1,"type":"pattern","pattern":{"id":"other-works","revision":3},"polarity":"affirmed",
            "contributionRoles":None,"stepRoles":[["ACTING"],["DIRECTING"]]}}}
    status, body = http("/api/discovery/entities","POST",request)
    if status != 200 or json.loads(body)["items"] != []: raise ValueError("New step Roles must parse before unpublished film data")
    return {"datasetRevision":BASE,"googleProviderPreserved":True,"anonymousProfileStatus":401,"filmStepRoleRequestStatus":200,"filmRecordsStillUnpublished":True}

def load(name, path):
    spec = importlib.util.spec_from_file_location(name,path)
    module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def main():
    if os.geteuid() != 0 or len(sys.argv) != 1: raise ValueError("Fixed administrator operation only")
    os.umask(0o077)
    stage = Path(__file__).resolve().parent
    for path in [stage,*stage.parents,stage/"film-publication-image-update.py"]:
        info = path.lstat()
        if path.is_symlink() or info.st_uid != 0 or info.st_mode & 0o022: raise ValueError("Untrusted root stage")
    helper_path = stage/"film-publication-image-update.py"
    if hashlib.sha256(helper_path.read_bytes()).hexdigest() != "db670372f43d7ff65ea39b89907dbd494c6cd4fea7090e81d508039efc395ade":
        raise ValueError("Frozen root helper differs")
    helpers = load("film_frozen_pin_helpers",helper_path)
    for path in [stage,*stage.parents]: helpers.trusted(path,directory=True)
    for name in ["film-publication-image-update.py","existing-image-verifier.py","web-deployment.json","web-image.tar.gz"]:
        helpers.trusted(stage/name)
    meta = json.loads((stage/"web-deployment.json").read_bytes())
    if meta["image"]["configId"] != NEW_CONFIG or meta["build"] != NEW_BUILD: raise ValueError("Fixed film Web image differs")
    verifier = load("film_web_archive_verifier",stage/"existing-image-verifier.py")
    verifier.archive_identity(stage/"web-image.tar.gz",meta["image"])
    root = Path("/opt/graph-knowledge")
    with helpers.existing_lock(root/".member-activation.lock",0):
        cfg_path, env_path = root/"compose.yaml", root/"app.env"
        helpers.trusted(cfg_path);helpers.trusted(env_path)
        old_bytes, env_sha = cfg_path.read_bytes(), helpers.sha(env_path)
        cfg_mode = stat.S_IMODE(cfg_path.stat().st_mode)
        pub = Path("/var/lib/plunode-publication")
        job = json.loads((pub/"jobs"/(NONCE+".json")).read_bytes())
        exclusion = json.loads((pub/"exclusion.json").read_bytes())
        if job["phase"] != "awaiting-publication-approval" or job["request"] != meta["publicationRequest"] or exclusion["active"] != NONCE:
            raise ValueError("Exact unconsumed publication request required")
        reservations = json.loads((pub/"reservations.json").read_bytes())
        if NONCE in reservations["nonces"]: raise ValueError("Publication already reserved; inspect only")
        dc = ["docker","compose","--env-file",str(env_path),"-f",str(cfg_path),"--profile","member","--profile","ops"]
        def compose(*args): return run(dc+list(args))
        def inspect(service):
            cid = compose("ps","-q",service)
            if not cid: raise ValueError("Expected running service missing")
            return json.loads(run(["docker","inspect",cid]))[0]
        previous_config = json.loads(compose("config","--format","json"))
        old_web = inspect("web")
        if old_web["Image"] not in OLD_IMAGES or run(["docker","exec",old_web["Id"],"cat","/app/.next-public/BUILD_ID"]) != OLD_BUILD:
            raise ValueError("Production Web advanced; preserve and inspect")
        runtime = {name:inspect(name) for name in ["graph-neo4j","graph-member-postgres"]}
        pg = runtime["graph-member-postgres"]
        def sql(query):
            return run(["docker","exec",pg["Id"],"psql","-X","-At","-U","postgres","-d","graph_member","-v","ON_ERROR_STOP=1","-c",query])
        def member_snapshot():
            tables = json.loads(sql("SELECT json_agg(table_name ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"))
            if len(tables) != 29 or not all(re.fullmatch("[a-z_]+",t) for t in tables): raise ValueError("Expected member schema differs")
            result = {}
            for table in tables:
                query = 'SELECT json_build_object(\'count\',count(*),\'hash\',md5(coalesce(string_agg(row_to_json(x)::text,\',\' ORDER BY row_to_json(x)::text),\'\'))) FROM "'+table+'" x'
                result[table] = json.loads(sql(query))
            migrations = json.loads(sql("SELECT json_object_agg(name,checksum) FROM member_migration"))
            if migrations != meta["migrations"]: raise ValueError("Existing migration ledger differs")
            return {"tables":result,"migrations":migrations}
        # Read-only fixed KG adapter, using the already updated trust/config.
        entry = __import__("runpy").run_path("/usr/local/sbin/plunode-publication")
        entry["verify_installation"]()
        executor = load("film_web_existing_gate",Path("/usr/local/lib/plunode-publication/publication-executor.py"))
        backend = executor.DockerBackend(pub,json.loads((pub/"trusted/config.json").read_bytes()))
        before_kg = backend.call("observe",{"candidate":str(stage)})["payload"]
        if before_kg["revision"] != BASE or before_kg["graphDigest"] != GRAPH: raise ValueError("Production KG advanced")
        helpers.save_new(stage/"compose.before.yaml",old_bytes)
        helpers.save_new(stage/"kg.before.json",helpers.body(before_kg))
        old_ai = run(["docker","exec",old_web["Id"],"node","-e","const f=require('fs'),c=require('crypto');console.log(c.createHash('sha256').update(f.readFileSync('/app/data/ai-lab/initial.json')).digest('hex'))"])
        if old_ai != meta["initialAiSha256"]: raise ValueError("Initial production AI artifact differs")
        run(["docker","load","--input",str(stage/"web-image.tar.gz")])
        image = meta["image"]["manifestId"]
        inspected = json.loads(run(["docker","image","inspect",image]))[0]
        if inspected["Id"] != image or inspected["Os"] != "linux" or inspected["Architecture"] != "amd64": raise ValueError("Loaded Web identity differs")
        with rollback_web_on_failure(compose,cfg_path,old_bytes,cfg_mode,helpers.atomic):
            before_member = member_snapshot()
            helpers.save_new(stage/"member.before.json",helpers.body(before_member))
            dump = stage/"member.before.dump"
            with dump.open("xb") as stream:
                os.fchmod(stream.fileno(),0o600)
                run(["docker","exec",pg["Id"],"pg_dump","-U","postgres","-d","graph_member","-Fc"],output=stream)
                stream.flush();os.fsync(stream.fileno())
            helpers.atomic(cfg_path,patch_image(old_bytes.decode(),image).encode(),cfg_mode)
            if json.loads(compose("config","--format","json")) != expected_config(previous_config,image): raise ValueError("Non-Web configuration changed")
            compose("up","-d","--no-deps","--pull","never","--wait","--wait-timeout","180","web")
            current = inspect("web")
            if current["Image"] != image or run(["docker","exec",current["Id"],"cat","/app/.next-public/BUILD_ID"]) != NEW_BUILD: raise ValueError("New Web did not start")
            checks = smoke()
            after_member = member_snapshot()
            if after_member != before_member: raise ValueError("Member data changed; preserve and inspect")
            after_kg = backend.call("observe",{"candidate":str(stage)})["payload"]
            if any(after_kg[k] != before_kg[k] for k in ["fixture","revision","release","graphDigest","receipts"]): raise ValueError("KG changed during Web-only switch")
            if helpers.sha(env_path) != env_sha: raise ValueError("Application credentials/flags changed")
            for name,before in runtime.items():
                after = inspect(name)
                if (after["Id"],after["State"]["StartedAt"]) != (before["Id"],before["State"]["StartedAt"]): raise ValueError("Non-Web service restarted")
            result = {"build":NEW_BUILD,"webImage":image,"oldBuild":OLD_BUILD,"memberTablesUnchanged":29,
                "migrationCountUnchanged":11,"memberDumpSha256":helpers.sha(dump),"environmentUnchanged":True,
                "otherComposeSettingsUnchanged":True,"databaseContainersUnchanged":True,"kgRevision":BASE,"kgGraphDigest":GRAPH,
                "initialAiArtifactUnchanged":True,"checks":checks,"signed":False,"publicApply":False,"backupDirectory":str(stage)}
            helpers.save_new(stage/"web-result.json",helpers.body(result));print(json.dumps(result),flush=True)

if __name__ == "__main__":
    try: main()
    except Exception as error:
        print(json.dumps({"error":"film-web-only-update-stopped","errorType":type(error).__name__,
                          "reason":str(error)[:160],"signed":False,"publicApply":False}),flush=True)
        sys.exit(1)
