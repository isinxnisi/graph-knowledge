# Phase 13 / v2：第2回関係モデル比較の研究台帳

2026-10-05。[第2回レビュー](../../../design/RELATION_MODEL_SECOND_COMPARISON_REVIEW.md)を読む。**研究用資料でありseed入力ではない。** runtime schemaや生成コマンドには渡さない。

## 版と受入

- [ledger.json](ledger.json)：Phase 12の8記録・40比較票と7 Sourceを継承し、D/E/C各3記録・45比較票・9 Sourceを追加。全17記録、85比較票、16 Source、23 Citation参照。
- [manifest.json](manifest.json)：ledger SHA-256、作業開始commit、親版v1の3ファイルと既存34凍結JSONのhash。
- 親版は[Phase 12/v1](../../phase-12-relation-model/v1/README.md)。v1の当時のpending状態・比較票・Sourceを変更していない。今後の受入／変更も次版へ残す。
- Phase 12新規7件は今回のユーザー指示により狭い事実だけ受入済み。humanAcceptanceとstructuredModelApprovalを分ける。F01の排他的adaptation/remake正規化は未受入。履歴はacceptanceHistoryに保持。
- Phase 13新規9記録は全て人間受入待ち。D03はRelationではない改称対照、D02は合併の一記録、C02は未モデル化の理論対象、C03は原版・端点判断待ち。約37という数字を37 seedable Claimと読まない。
- `kind=null`はC02の研究用対象descriptorだけ。新Entity kind/schemaを実装した意味ではない。`event` refは特定開催回の研究同定でありDBへの登録ではない。UUID/QIDを新規割当していない。

## 資料の確認範囲

9追加Sourceは公開HTTP GETで200を確認。URL／UTC／本文bytes／SHA-256を記録した。webツールでtimeoutになる議事録も通常GETで取得し、ULBの来歴・title・参加／欠席の頁を読んだ。PDFは一時的なpypdf環境で抽出。アプリ依存は変更していない。

原HTML/PDF/抽出全文は/tmpに限り、Gitへ入れない。hashは永続アーカイブではない。変化時には短い断片だけで採用を自動更新せず、locatorと前後を読み直す。Sourceの断片は一度だけ記録しCitationから参照する。sourceMeaningは編集要約で公式翻訳ではない。

資料日付の境界：

- Curie報告は表紙2015年2月、内頁footer2014年の不一致を残す。合併1970／改称1978と別。
- Solvay議事録は1928年出版、対象回は1927-10-24〜29。配信URLの2025年と別。参加者の全日程出席は保証しない。
- Einstein自伝は原稿の英訳複製。初版1949とMJF再版（再版年不明）を分離。ファイル名1946を公開日・関係始期へ変換しない。
- C01は帰属付き書簡英訳抜粋、C03はNortonの研究章内の本人文章再引用。原書簡／原版p.53の全文照合は未完了で、人間受入もpending。
- 科学C09の帰属・元講演・翻訳・年代は未解決。今回の再引用材料から自動承認しない。

## 再検証

研究台帳の参照・必須欄・件数・hashを検証する。意味の正しさ・人間受入の妥当性を機械で認定するものではない。

```bash
python3 - <<'PY'
import hashlib, json
from pathlib import Path
p = Path('docs/research/phase-13-relation-model/v2')
l = json.loads((p / 'ledger.json').read_text())
m = json.loads((p / 'manifest.json').read_text())
assert l['recordType'] == 'relation-model-research-not-seed-data'
assert hashlib.sha256((p / 'ledger.json').read_bytes()).hexdigest() == m['ledger']['sha256']
sources = {s['id']: s for s in l['sources']}
entities = {e['ref']: e for e in l['entities']}
assert len(sources) == len(l['sources']) == 16
assert len(entities) == len(l['entities'])
assert len({c['id'] for c in l['candidates']}) == len(l['candidates']) == 17
accepted = {'A02', 'B01', 'B02', 'B03', 'B04', 'F01', 'F02'}
fields = ('supportedMeaning', 'lostMeaning', 'overclaimRisk', 'conditionalSearch',
          'polarityTarget', 'periodAndScope', 'claimIdentity', 'comparisonKey',
          'directionAndSymmetry', 'unspecifiedMeaning', 'mechanicalGuarantees')
refs = []
for c in l['candidates']:
    assert c['subjectKind'] == entities[c['subjectRef']]['kind']
    assert c['objectKind'] == entities[c['objectRef']]['kind']
    assert c['structuredModelApproval']['status'] == 'pending'
    assert c['humanAcceptance']['status'] == ('accepted-narrow-fact-for-comparison' if c['id'] in accepted else 'pending')
    assert {v['model'] for v in c['modelComparisons']} == {'M1', 'M2', 'M3', 'M4', 'M5'}
    assert len(c['modelComparisons']) == 5
    for v in c['modelComparisons']:
        assert all(v.get(f) for f in fields), (c['id'], v['model'])
        assert v['periodAndScope']['period'] == c['period']
    for ref in c['citations']:
        refs.append(ref['id'])
        s = sources[ref['sourceId']]
        assert ref['locator'] and ref['language'] == s['language']
        assert set(ref['fragmentIds']) <= {f['id'] for f in s['verifiedFragments']}
new = [c for c in l['candidates'] if c['collectedInPhase'] == 13]
assert len(new) == 9 and all(c['humanAcceptance']['status'] == 'pending' for c in new)
assert sum(c['recordCategory'] == 'identity-name-history-control' for c in new) == 1
assert len(refs) == len(set(refs)) == 23
assert sum(len(c['modelComparisons']) for c in l['candidates']) == 85
assert len(l['existingMaterial']) == 22
for item in m['frozenInputs'] + m['parentFrozenInputs']:
    assert hashlib.sha256(Path(item['path']).read_bytes()).hexdigest() == item['sha256'], item['path']
assert len(m['frozenInputs']) == 34 and len(m['parentFrozenInputs']) == 3
print('17 records / 85 comparisons / 23 citations / 7 narrow facts accepted / 9 pending / 37 frozen files: OK')
PY
npm run vocabulary:check -- --base-ref 49eafb8
```

機械保証欄は将来各方式を実装した時に検証できる範囲であり、このPhaseで新しいruntime validatorを完成させた意味ではない。
