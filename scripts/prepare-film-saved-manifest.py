#!/usr/bin/env python3
"""Prepare bounded saved-film review with all-candidate audit. Read-only live metadata; no acceptance."""
import argparse,gzip,importlib.util,json,os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/"docs/research/film-worker-pilot-20261028"
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--runtime",type=Path,required=True)
    ap.add_argument("--prior-backup",type=Path,required=True)
    ap.add_argument("--delivery",type=Path,required=True)
    ap.add_argument("--output",type=Path,default=ROOT/".local/film-manifest-20261028")
    args=ap.parse_args();work=args.output.resolve()
    assert work.is_relative_to((ROOT/".local").resolve()) and not work.exists(),"New private preparation directory required"
    work.mkdir(parents=True);FOLDER.mkdir(parents=True,exist_ok=True)
    a=module("film_manifest_adapter",ROOT/"scripts/collect-film-manifest.py")
    def save(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(a.dump(x))
    def ref(p):return {"file":str(p.relative_to(ROOT)),"sha256":a.sha(p)}
    snapshot=module("film_comparison_refresh",ROOT/"scripts/refresh-film-comparison.py").refresh(args.prior_backup,args.runtime,args.delivery)
    comparison=work/"comparison.json.gz";comparison.write_bytes(gzip.compress(a.dump(snapshot).encode(),mtime=0))
    candidates=ROOT/"docs/research/film-discovery-pilot-20261026/CANDIDATES.json"
    reviews=ROOT/"docs/research/film-discovery-pilot-20261026/source_reviews.json"
    coverage=ROOT/"docs/research/film-release-20261027/ASTRA_RESEARCH_COVERAGE.json"
    plan=a.load(ROOT/"docs/research/knowledge-publication-review-20261028/results/coverage-plan.json")
    selected=[r["researchCandidateId"] for r in plan["records"] if r["lane"].startswith(("A-","B-"))]
    published=[r["researchCandidateId"] for r in plan["records"] if r["lane"]=="already-published"]
    deferred=[r["researchCandidateId"] for r in plan["records"] if r["researchCandidateId"] not in set(selected+published)]
    saved=a.load(candidates);byid={c["id"]:c for c in saved["candidates"]}
    # Three missing performance contexts, confirmed on the already-selected source.
    facts=[("Q481832","Amy Adams","Louise Banks"),("Q23365","Jeremy Renner","Ian Donnelly"),("Q182763","Forest Whitaker","Colonel Weber")]
    credits=[]
    for qid,name,character in facts:
        c=next(c for c in saved["candidates"] if c["subject"]==qid and c["object"]=="Q20382729" and c["research_role"]=="CAST")
        credits.append({"candidateId":c["id"],"subjectQid":qid,"workQid":"Q20382729","role":"ACTING","sourceId":"S06",
            "sourceUrl":"https://www.paramount.com/movies/arrival","originalRoleText":"About the Cast",
            "personText":name,"characterText":character,"locator":"About the Cast / "+name+" / "+character,
            "observedAt":"2026-10-28","identityNote":"既存S06と同じ作品・人物。公式人物別役名欄で実写の演技担当を確認。声・吹替の欄ではない。",
            "evidenceKind":"minimal-factual-credit-note-not-verbatim-page","formalAcceptance":False})
    # Only missing headings/character contexts on three saved Warner sources are transcribed.
    observed = [
        ("S05","Q60834962","DIRECTING","Q548823","監督","ドゥニ・ヴィルヌーヴ",None),
        ("S05","Q60834962","SCREENWRITING","Q942932","脚本","エリック・ロス",None),
        ("S05","Q60834962","SCREENWRITING","Q6271612","脚本","ジョン・スペイツ",None),
        ("S05","Q60834962","SCREENWRITING","Q548823","脚本","ドゥニ・ヴィルヌーヴ",None),
        ("S05","Q60834962","CAST","Q19877770","出演","ティモシー・シャラメ","ポール"),
        ("S07","Q25188","DIRECTING","Q25191","監督","クリストファー・ノーラン",None),
        ("S07","Q25188","SCREENWRITING","Q25191","脚本","クリストファー・ノーラン",None),
        ("S07","Q25188","PRODUCING","Q25191","製作","クリストファー・ノーラン",None),
        ("S07","Q25188","PRODUCING","Q242951","製作","エマ・トーマス",None),
        ("S07","Q25188","CAST","Q38111","キャスト","レオナルド・ディカプリオ","ドム・コブ"),
        ("S07","Q25188","CAST","Q211553","キャスト","渡辺 謙","サイトー"),
        ("S07","Q25188","CAST","Q123351","キャスト","マイケル・ケイン","マイルズ"),
        ("S08","Q13417189","DIRECTING","Q25191","監督","クリストファー・ノーラン",None),
        ("S08","Q13417189","SCREENWRITING","Q25191","脚本","クリストファー・ノーラン",None),
        ("S08","Q13417189","SCREENWRITING","Q372788","脚本","ジョナサン・ノーラン",None),
        ("S08","Q13417189","PRODUCING","Q25191","製作","クリストファー・ノーラン",None),
        ("S08","Q13417189","CAST","Q188955","キャスト","マシュー・マコノヒー","クーパー"),
        ("S08","Q13417189","CAST","Q123351","キャスト","マイケル・ケイン","ブランド教授"),
    ]
    # Already-read AFI HISTORY ties these two cast members to dramatic characters.
    for sid,workqid,qid,name,character in [
        ("S01","Q184843","Q81328","Harrison Ford","Deckard"),
        ("S11","Q184255","Q48337","Morgan Freeman","Eddie Scrap-Iron Dupris")]:
        c=next(c for c in saved["candidates"] if c["subject"]==qid and c["object"]==workqid and c["research_role"]=="CAST")
        credits.append({"candidateId":c["id"],"subjectQid":qid,"workQid":workqid,"role":"ACTING","sourceId":sid,
            "originalRoleText":"Cast","personText":name,"characterText":character,
            "locator":"Cast / HISTORY / "+name+" / "+character,"observedAt":"2026-10-28",
            "identityNote":"既存AFI人物対応を再利用。HISTORYの配役と実写cast文脈を確認。付随するナレーションだけを出演と扱ったものではない。",
            "evidenceKind":"minimal-factual-credit-note-not-verbatim-page","formalAcceptance":False})
    source_rows={s["id"]:s for s in a.load(reviews)}
    for sid,workqid,research,qid,term,name,character in observed:
        c=next(c for c in saved["candidates"] if c["subject"]==qid and c["object"]==workqid and c["research_role"]==research)
        row={"candidateId":c["id"],"subjectQid":qid,"workQid":workqid,"role":a.ROLE_MAP[research],"sourceId":sid,
            "sourceUrl":source_rows[sid]["url"],"originalRoleText":term,"personText":name,"characterText":character,
            "locator":("キャスト" if character else "クレジット / スタッフ")+" / "+term+" / "+name+((" / "+character) if character else ""),
            "observedAt":"2026-10-28","identityNote":"既存の人物・作品・担当照合を再利用し、未転記の短い原表記と必要な役柄だけ確認。括弧内吹替担当は採らない。",
            "evidenceKind":"minimal-factual-credit-note-not-verbatim-page","formalAcceptance":False}
        if qid=="Q19877770":
            row["identityNeedsDecision"]=True
            row["identityNote"]="公式表記ティモシー・シャラメと保存labelティモテ・シャラメの対応は人間判断へ保留。QIDだけで同定済みにしない。"
        credits.append(row)
    evidence=FOLDER/"minimal-credit-notes.json"
    save(evidence,{"authority":"factual-supplements-not-approval","references":[],"sourceReviewSha256":a.sha(reviews),
        "credits":credits,"limits":["Missing headings and performance contexts were checked only on six already-selected sources. No full-page text or images stored.",
            "Other missing original headings remain untranscribed, not nonexistent."]})
    recipe=work/"manifest.json"
    manifest={"schemaVersion":1,"adapter":a.ADAPTER,"recordedAt":"2026-10-27T18:55:00Z",
        "candidateIds":selected,"heldCandidateIds":[],"deferredCandidateIds":deferred,"publishedCandidateIds":published,
        "maxClaims":63,"inputs":{"candidates":ref(candidates),"sourceReviews":ref(reviews),"comparison":ref(comparison),
        "coverage":ref(coverage),"evidence":ref(evidence)}}
    save(recipe,manifest)
    _,_,_,rows,proposed,mappings=a.inspect(ROOT,recipe,check_selection=False)
    manifest["heldCandidateIds"]=[r["candidateId"] for r in rows if r["status"]!="ready-for-human-review"]
    save(recipe,manifest)
    # All individual and shared dependencies are regenerated and checked from the fixed manifest.
    w=module("film_manifest_workflow",ROOT/"scripts/collection-workflow.py")
    options=w.parser().parse_args(["film-review","--recipe",str(recipe),"--trial",str(work/"trial"),
        "--output",str(work/"review"),"--decision-output",str(work/"decision-draft.json"),
        "--decision-id","film-saved-ab-20261028","--release","film-saved-ab-20261028"])
    prepared=w.execute(options)
    summary={k:v for k,v in prepared.items()}
    summary.update(authority="pending-human-review-not-formal-acceptance",manifest=ref(recipe),comparison=ref(comparison),
        productionAcceptanceReady=False,productionRevision=snapshot["public"]["revision"],
        nextBoundary="Fresh production backup + runtime/identity/Role-application judgments; never treat this offline draft as acceptance",
        submittedCounts={f:len(v) for f,v in proposed.items()})
    audit={r["candidateId"]:r for r in rows}
    table=[];proposal_by_claim={c["id"]:c for c in proposed["claims"]}
    for r in plan["records"]:
        ident=r["researchCandidateId"];x=audit.get(ident)
        table.append({**r,"reviewStatus":x["status"] if x else ("already-published" if ident in published else "held"),
            "reasons":x["reasons"] if x else (["already-published-do-not-reaccept"] if ident in published else ["outside-ab-current-review-preserved"]),
            "researchReason":byid[ident]["reason"],"proposedClaimId":x["claimId"] if x else None,"sourceReviewIds":x["sourceIds"] if x else [],
            "proposedRole":x["proposedRole"] if x else None,"newAcceptanceAuthorized":False})
    assert len(table)==124 and len(mappings)==97 and sum(r["lane"].startswith(("A-","B-")) for r in table)==63
    save(FOLDER/"all-candidate-audit.json",{"authority":"review-only","records":table,"entities":list(mappings.values()),
        "counts":{"allCandidates":124,"checkedPending":79,"unmappedEntityCandidates":94,"abReviewed":63,
            "submittedClaims":len(proposed["claims"]),"notSubmittedChecked":79-len(proposed["claims"])},"formalAcceptance":False})
    for name in ["proposed-records.json","decision-request.json","context.json","review.json","review-manifest.json"]:
        target=FOLDER/"review"/name;target.parent.mkdir(exist_ok=True);target.write_bytes((work/"review"/name).read_bytes())
    # Retain the exact original draft with its original hashed references; no invented decision.
    (FOLDER/"decision-draft.json").write_bytes((work/"decision-draft.json").read_bytes())
    save(FOLDER/"preparation.json",summary)

    labels={e["id"]:e["labels"].get("ja",e["labels"].get("en"))["value"] for e in saved["entities"]}
    states={"ready-for-human-review":"提出可能","missing-evidence":"不足根拠","identity-judgment":"同一性判断","held":"保留"}
    reasons={"original-role-term-untranscribed":"原役割見出しが未転記（根拠不存在ではない）",
        "dramatic-performance-context-needs-confirmation":"実演・役柄の文脈が未確認",
        "person-name-variant-needs-judgment":"公式ティモシー／保存ティモテの人物対応判断",
        "entity-identity-collision":"Entity UUID対応の判断待ち","structured-film-scope-unsupported":"映画の構造化scope未対応",
        "qualified-period-needs-judgment":"原記録の期間限定を要判断","potential-existing-claim-requires-comparison":"既存Claimとの重複比較"}
    def text(value):return str(value).replace("|","／").replace("\n"," ")
    lines=["# 映画保存候補：人間判断資料","","状態：未承認。正式受入・公開は未実施。提出集合は機械的に準備できた候補であり、意味・同一性の人間判断を代用しない。",
        "","提出可能34 Claim＝A群15／B群19。新Entity UUID候補29、既存Entity再利用2、新Source5、Citation34。",
        "全63記録を点検し、未提出29記録も下段に残す。79照合済み未収録／94 Entity候補の正式未確定はそのまま。","","## 提出集合",
        "","全Claimは肯定・人物→作品・一Claim一Role。scopeはnull（未構造化）、period両端null。公開年や、全cut・全地域・全言語の保証を追加しない。",
        "","B群19件のSCRIPT_WRITING／PRODUCING適用は固定定義と原表記を見て判断する。原作・原案・製作総指揮・出資を同一視しない。",
        "","| #／群 | 作品／人物 | Role／原表記 | 根拠 | Claim UUID |","| --- | --- | --- | --- | --- |"]
    ready=sorted((r for r in rows if r["status"]=="ready-for-human-review"),
        key=lambda r:(labels[r["workQid"]],r["proposedRole"],labels[r["subjectQid"]]))
    for n,r in enumerate(ready,1):
        e=r["chosenEvidence"];src=e["source"];group="A" if r["researchRole"] in ["DIRECTING","CAST"] else "B"
        lines.append("| "+str(n)+"／"+group+" | "+text(labels[r["workQid"]])+"<br>"+text(labels[r["subjectQid"]])+
            " | "+r["proposedRole"]+"<br>"+text(e["term"])+("／"+text(e["character"]) if e["character"] else "")+
            " | ["+src["id"]+"]("+src["url"]+")<br>"+text(e["locator"])+" | "+r["claimId"]+" |")
    lines += ["","## 未提出集合","","不足根拠28件、同一性判断1件。未転記は再調査のやり直しを意味せず、保存した対応と原資料から不足部分だけを補う。",
        "","| 群 | 作品 | 人物 | 提案Role | 理由 |","| --- | --- | --- | --- | --- |"]
    for r in sorted((r for r in rows if r["status"]!="ready-for-human-review"),key=lambda r:(labels[r["workQid"]],r["proposedRole"],labels[r["subjectQid"]])):
        group="A" if r["researchRole"] in ["DIRECTING","CAST"] else "B"
        lines.append("| "+group+" | "+text(labels[r["workQid"]])+" | "+text(labels[r["subjectQid"]])+" | "+r["proposedRole"]+" | "+
            states[r["status"]]+": "+"／".join(reasons.get(x,x) for x in r["reasons"])+" |")
    lines += ["","## Entity UUID判断","","既存の正式3 UUIDは同じ外部識別子・kind・本文で再利用する。新規29 UUIDは候補であり、正式確定していない。",
        "","| QID | 対象 | UUID | 扱い |","| --- | --- | --- | --- |"]
    submitted_entities={e["id"] for e in proposed["entities"]}
    for q,m in sorted(mappings.items(),key=lambda item:labels[item[0]]):
        if m["id"] in submitted_entities or m["status"]=="reuse-existing-uuid":
            lines.append("| "+q+" | "+text(labels[q])+" | "+m["id"]+" | "+("既存正式UUIDを保持" if m["status"]=="reuse-existing-uuid" else "新規UUIDの確定判断待ち")+" |")
    catalog={e["id"]:e for e in a.load(ROOT/"vocabulary/contribution-roles/catalog.json")["entries"]}
    lines += ["","## 参照する正式Role定義","","既存定義・承認履歴を変更しない。次のhashは既存vocabularyHashと同じ正規化による。",
        "","| Role | 定義hash |","| --- | --- |"]
    for role in sorted({c["contribution"]["roleId"] for c in proposed["claims"]}):
        lines.append("| "+role+" | "+a.digest(catalog[role])+" |")
    lines += ["","## 根拠の保存範囲","","CANDIDATES/source_reviewsの保存済み人物・作品・担当照合を再利用した。今回追加したのは既存6資料の短い役割語・人物対応・必要な役柄だけ。資料本文全体・画像は保存していない。",
        "原文抜粋が保存されているように人物別の文章を再構成していない。原語、locator、原資料URL、取得日、研究候補ID、資料hashはJSONで追跡できる。",
        "","既存C/D16記録、構造化候補37、保留6は今回のA/B点検外として全件台帳に保持。公開済み2 Claimは選択集合から除外。",
        "","現在の票はoffline照合の未承認draft。正式受入には最新本番backup・全receiptの最終照合と、固定票への人間判断が必要。公開署名は別工程。",
        "","- 全件：[all-candidate-audit.json](all-candidate-audit.json)",
        "- 本文：[review/proposed-records.json](review/proposed-records.json)",
        "- 未承認票：[decision-draft.json](decision-draft.json)",
        "- 補足事実：[minimal-credit-notes.json](minimal-credit-notes.json)"]
    (FOLDER/"CANDIDATE_REVIEW.md").write_text("\n".join(lines)+"\n")
    print(json.dumps({"claims":len(proposed["claims"]),"abReviewed":63,"held":len(manifest["heldCandidateIds"]),
        "entities":len(proposed["entities"]),"draftSha256":a.sha(work/"decision-draft.json"),"formalAcceptance":False}))
if __name__=="__main__":main()
