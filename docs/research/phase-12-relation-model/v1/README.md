# Phase 12 / v1：関係モデル比較の収集台帳

2026-10-05。**研究用資料であり、seed入力ではない。** [比較レビュー](../../../design/RELATION_MODEL_COMPARISON_REVIEW.md)を読む。datasets/やfixtureと異なる場所・recordTypeに置き、現行生成・seedコマンドへ渡さない。今回汎用収集・更新パイプラインは追加していない。

## 内容と版の境界

- [ledger.json](ledger.json)：原語・言語・人物／作品粒度、7 Source、8候補記録、13参照記録、各候補の5方式・11項目の比較。既存Visitorの対照1件＋新規7候補で40比較票。凍結22 ClaimのID・意味・期間・制作限定も比較基準として照合した。
- [manifest.json](manifest.json)：ledgerのSHA-256、作業開始commit、既存fixture／datasets／語彙JSON全34ファイルのhash。研究用manifestで、既存datasetの生成manifestを変更しない。
- v1は資料確認・比較段階の版。新規7件のhumanAcceptanceはpending。資料に関係が明記されていることと、モデル・正規化・公開・投入を人が受け入れることを分ける。
- A01の既存科学C05は広い関与だけ受入済み。Visitor限定の受入は引き継がない。新しい7候補とA01の限定案にUUIDを割り当てていない。既存IDを持つ2 Entity以外は研究用refで参照する。
- 新規QID収集は行っていない。原資料の人物・作品粒度で同定したが、正式投入前の外部ID照合は別工程。The Magnificent Sevenという題名だけでは1954年作の旧公開題／1960年作／2016年作を区別できない。

版を確定した後の受入変更・Source更新・意味モデル確定はv2等の次版へ。以前の確認・保留理由を削除しない。承認者・判断日・受入範囲は実際の人間判断があった時だけ記録する。今回のCodex確認を人間受入としない。

## 原資料の取得と再確認

SourceごとにURL、取得方法、UTC日時、言語、公開日／版／資料の日付の違い、短い検証断片とlocatorを保持する。候補のCitationは断片IDを参照し、同じ引用を複製しない。日本語のsourceMeaningは編集要約であり原文引用・公式翻訳ではない。

6 Sourceは通常の公開HTTP GETで200、本文bytesとSHA-256を記録。省記事S04は直接GETでは403だったがweb.openで本文を読めたため、本文hashはnull。Nobel／Musée Curie PDFもweb.openでは403だったが通常GETでは200で、検索抄録だけの確認ではない。PDFは一時ディレクトリのpypdfで抽出し、PDF第3ページ／印刷p.2を読んだ。pypdf・typing_extensionsは作業用/tmpに展開しただけでプロジェクトの依存へ追加していない。

**hashは外部本文のアーカイブではない。** 元HTML/PDF、画像、全文の抽出テキストはGitへ保存しない。再取得時のhash不一致は広告・ナビゲーション等の変更でも起こり得る。locatorと意味箇所を再読し、変更時は次版に記録する。S04はhash比較ができないので、公開日・見出し・婚姻文を直接再確認する。消失・取得失敗時には以前の断片だけで新規受入を自動決定しない。

Sourceの主張単位は限定する：NBIは歴史略歴、Nobelは1966年再刊を示す略歴、Musée Curieは教育資料／アーカイブ記述、BFIは専門機関の編集記事。Sourceの数や複数掲載を、独立一次証言の数・強さとみなさない。

## 比較票の読み方

M1〜M5のprojectionは設計記号で、正式なpredicate／qualification値ではない。supportedMeaning、lostMeaning、overclaimRisk、conditionalSearch、polarityTarget、periodAndScope、claimIdentity、comparisonKey、directionAndSymmetry、unspecifiedMeaning、mechanicalGuaranteesを候補別に読む。

mechanicalGuaranteesは**その方式を将来実装する時に検証可能なこと**で、今回完成したvalidator機能ではない。M3/M4/M5は命題構成・値のdomain・処理の共有という異なる軸であり、組合せ可能。今回のJSON形式を次のClaim schema案として採用しない。

## 小さい再検証

リポジトリのルートで実行する。ネットワーク・DB・seedは不要。この検証は必須欄・参照・件数・hashの充足だけを確認し、意味の正しさや人間受入を自動認定しない。

```bash
python3 - <<'PY'
import hashlib, json
from pathlib import Path
p = Path('docs/research/phase-12-relation-model/v1')
ledger = json.loads((p / 'ledger.json').read_text())
manifest = json.loads((p / 'manifest.json').read_text())
assert ledger['recordType'] == 'relation-model-research-not-seed-data'
assert hashlib.sha256((p / 'ledger.json').read_bytes()).hexdigest() == manifest['ledger']['sha256']
sources = {s['id']: s for s in ledger['sources']}
entities = {e['ref']: e for e in ledger['entities']}
assert len(sources) == len(ledger['sources']) == 7
assert len(entities) == len(ledger['entities']) == 10
candidates = ledger['candidates']
assert len({c['id'] for c in candidates}) == len(candidates) == 8
assert sum(c['isNewCandidate'] for c in candidates) == 7
assert len({c['id'] for c in ledger['existingMaterial']}) == 22
fields = ('supportedMeaning', 'lostMeaning', 'overclaimRisk', 'conditionalSearch',
          'polarityTarget', 'periodAndScope', 'claimIdentity', 'comparisonKey',
          'directionAndSymmetry', 'unspecifiedMeaning', 'mechanicalGuarantees')
citation_ids = []
for c in candidates:
    assert c['subjectKind'] == entities[c['subjectRef']]['kind']
    assert c['objectKind'] == entities[c['objectRef']]['kind']
    assert c['humanAcceptance']['status'] == 'pending'
    assert len(c['modelComparisons']) == 5
    assert {m['model'] for m in c['modelComparisons']} == {'M1', 'M2', 'M3', 'M4', 'M5'}
    for m in c['modelComparisons']:
        assert all(m.get(f) for f in fields), (c['id'], m['model'])
        assert m['periodAndScope']['period'] == c['period']
    for citation in c['citations']:
        citation_ids.append(citation['id'])
        source = sources[citation['sourceId']]
        assert citation['locator'] and citation['language'] == source['language']
        assert set(citation['fragmentIds']) <= {f['id'] for f in source['verifiedFragments']}
assert len(set(citation_ids)) == len(citation_ids) == 13
assert sum(len(c['modelComparisons']) for c in candidates) == 40
for item in manifest['frozenInputs']:
    assert hashlib.sha256(Path(item['path']).read_bytes()).hexdigest() == item['sha256'], item['path']
print('8 records / 7 new pending / 40 comparisons / 13 references / 34 frozen files: OK')
PY
npm run vocabulary:check -- --base-ref 27cb3b0
```

Gitリンクの作業開始commitは固定する。既存入力のhash一致だけで「以前の受入の意味が正しい」ことを再証明したとは扱わない。
