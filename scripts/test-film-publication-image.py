"""Build and test a disposable synthetic-approval image. NEVER install or trust this image."""
import argparse, importlib.util, json, shutil, subprocess, tempfile, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def run(argv,cwd):
    r=subprocess.run(argv,cwd=cwd,capture_output=True,text=True,timeout=600)
    if r.returncode:raise RuntimeError(r.stderr[-2000:]+r.stdout[-2000:])
    return r.stdout
def verify(public_fixture,film_fixture,output):
    with tempfile.TemporaryDirectory(prefix="ISOLATED-film-image-") as td:
        code=Path(td)
        for folder in ["lib","neo4j","vocabulary"]:shutil.copytree(ROOT/folder,code/folder)
        for file in ["package.json","package-lock.json","tsconfig.json","ops/Dockerfile.publication","ops/Dockerfile.publication.dockerignore",
                     "scripts/public-kg.ts","scripts/publication-runtime.ts","scripts/publication-backup-plan.ts",
                     "docs/research/film-beta-issue43/role-review-drafts.json"]:
            target=code/file;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/file,target)
        (code/"node_modules").symlink_to(ROOT/"node_modules",target_is_directory=True)
        run(["node","--import","tsx","-e",
            "const fs=require('node:fs'),{prepareFilmRoleDecision,registerFilmRoles}=require('./lib/domain/film-role-registration.ts');"
            "const p='vocabulary/contribution-roles/',r=f=>JSON.parse(fs.readFileSync(f));"
            "const old=r(p+'catalog.json'),c={...old,entries:old.entries.filter(e=>!['DIRECTING','ACTING'].includes(e.id))},b=r(p+'baseline-v1.json'),v=r(p+'reviews.json').filter(e=>!['DIRECTING','ACTING'].includes(e.targetId)),d=r(p+'film-pending.json'),t=r('docs/research/film-beta-issue43/role-review-drafts.json');"
            "const a={...prepareFilmRoleDecision(c,v,d,t),status:'approved',humanDecision:{actorType:'human',reviewer:'ISOLATED TEST ONLY',decidedAt:'2026-10-26T00:00:00Z',statement:'Synthetic disposable Docker validation only'}};"
            "const n=registerFilmRoles(a,c,b,v,d,t);fs.writeFileSync(p+'catalog.json',JSON.stringify(n.catalog));fs.writeFileSync(p+'reviews.json',JSON.stringify(n.reviews));"],code)
        tag="graph-knowledge-publication:film-synthetic-test-"+uuid.uuid4().hex[:8]
        run(["docker","build","--label","org.plunode.test-only=true","-f","ops/Dockerfile.publication","-t",tag,"."],code)
        spec=importlib.util.spec_from_file_location("film_image_test",ROOT/"scripts/test-publication-image.py")
        test=importlib.util.module_from_spec(spec);spec.loader.exec_module(test)
        try:
            result=test.verify(tag,public_fixture,film_fixture)
        finally:
            run(["docker","image","rm",tag],code)
        result.update(testOnly=True,productionInstallable=False,approval="synthetic-temporary-fixture",imageTag=tag,imageRemoved=True)
        output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
        return result
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    for name in ["public-fixture","film-fixture","output"]:p.add_argument("--"+name,type=Path,required=True)
    a=p.parse_args();print(json.dumps(verify(a.public_fixture,a.film_fixture,a.output)))
