# 検証記録と適用限界
2026-10-26。Node v24.15.0（手元に導入済みの24系。package enginesの24.21.0そのものではない）、Neo4j 5.26.31-community。比較対象のSHAと主要ファイルhashは[VERIFICATION_INPUTS.json](VERIFICATION_INPUTS.json)。手動作業ロックを保持した独立worktreeで実施した。

| 検証 | 結果 |
| --- | --- |
| オフラインfixture再生成照合 | 保存済み入力2ファイルのhash・出力一致 |
| npm test -- --maxWorkers=2 | 73ファイル・862テスト成功。旧漫画Role、rev1/2、隣接探索、Graph保存／URLを含む |
| npm run typecheck | 成功 |
| npm run lint | 成功。既存語彙レビューに関するwarningは従来のもの |
| 新しい段別Role単体／UI | 上記に含む6テスト。schema、段順、空集合/null、旧キー不変、証拠、Cypher、URL、Graph可視化、両editorの条件保持 |
| python3 scripts/test-film-step-roles.py | 使い捨て実Neo4jで4シナリオ成功。[結果](ISOLATED_RESULTS.json) |
| git diff --check | 成功 |
| 正式な映画collector／acceptance／public validate/apply | 未実施。研究fixtureはimport形式でなく未承認 |
| Next実ブラウザの映画E2E・画面寸法・本番負荷 | 未実施。HTTP handler＋実DB＋Graph状態＋jsdom UIの検証範囲 |
| main／3200／VPS／betaへの配置 | ユーザーの分離指示により未実施。稼働環境を変更していない |

## 実データと反例
研究母集団の10作品・124候補、照合済み81記録はそのまま保持。3作品に対する監督／出演の照合済み13 statementから、同じLeoneクレジットの並列statementを研究上の代表1件へ絞り、12 Claim・12 Citation・10 Entityを生成した。本番Claimの統合やID再利用ではない。元の両statementは保存済み候補に残っている。

S11の4 Citationだけに短い原役割見出しが保存されており、S09/S10の8 Citationは原語未転記としてnullを維持する。支持する人物・作品・役割は先行source_reviewsの対応表で再照合した。見出しを個人クレジット全文として再構成せず、原文不足を正式受入の保留条件に残した。範囲未構造化はscope:null、公開年をperiodへ転記しない。

検証した成立経路と否定例：
- 許されざる者 ← ACTING / Clint Eastwood → DIRECTING / ミリオンダラー・ベイビー：1端点組。
- 共通ACTING OR DIRECTING：3端点組。段別DIRECTING→ACTING：2端点組。
- 中央人物名Clint Eastwoodの作品検索は3作品成立。Morgan Freemanの名前でACTING→DIRECTINGを要求すると0件。
- 空集合、否定、非公開、Role欠落、canonical方向反転、証拠Claim列入替、revision更新は不成立又は明示エラー。
- independent ClaimのSource/Citationを実DBからgetClaimで読み、S11のDirector原語とURLを確認。S10の未転記をnullのまま確認。
- Graphは最初に起点の枝だけを表示し、中央人物を開くと2つ目の独立Claimを表示。保存・復元後も段別条件を保持する。
- ページ境界検証には別途25件の合成データを同じ隔離DBに追加。対象検索20+5、Graph12+12+1、重複・欠落なし。条件を左右交換したcursorは拒否。合成データを映画の収録数・根拠数に含めない。

## 検証中の修正
初回は既存の固定テストポート7695が別作業で使用中だった。既存コンテナは停止せず空きloopbackポートへ移し、新しい空DBであることを書込み前に確認する。テスト用接続だけを既存read transactionへ注入し、正規ポートガードや公開接続設定は変更しない。

最初の全体並列実行は漫画release等のhookと連結評価がtimeoutになった。失敗した3ファイルを単独workerで再確認した後、全体を2 workerで再実行し862件成功。隔離DBも初期indexなし・同時高負荷ではtimeoutになったため、通常のEntity/Claim/Source一意indexを作り、負荷が落ち着いてから再実行して成功した。timeoutを正常0件に読み替えていない。小規模実証の時間は大規模運用の性能保証ではない。

Graphの共通Claim filterを段別条件にそのまま適用すると、段の情報がないため可視Claimが消えることを検査で発見した。完全経路で段ごとに検証したClaim集合を描画へ渡すよう修正し、起点枝・人物展開の実際の可視Claimをテストした。並列Roleを単純ORへ変換して回避していない。

## 先行成果の保存
461cd1c配下の全資料・コードはbyte単位で無変更。過去のcheck-current.tsは当時のruntimeを対象とする凍結証跡で、現行tsconfigの広いincludeから型エラー、lintからanyが検出された。実装や保存証拠を書き換える代わりに、この1ファイルだけをtsconfig/eslintから明示除外した。新規コードの検査対象は維持。過去CURRENT_RUNTIME_PROOF.json／verify.pyはこのbranchの現行結果として再生成・再解釈していない。
