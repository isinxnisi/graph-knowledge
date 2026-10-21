# 公式AIキャラクター v0.2 静止比較の検証

2026-10-22。`codex/ai-lab-foundation` の `6e95317` を基準に、ユーザーのv0.2方針を比較試作へ反映した。

## 確認先

- 比較一覧：<http://127.0.0.1:3286/ai-character-study>
- B案をHome上で確認：<http://127.0.0.1:3286/?character-study=soft-flat>
- B案をGraph上で確認：<http://127.0.0.1:3286/explore/2b7c6289-d050-4dc0-93e3-9307681253cc?character-study=soft-flat>
- 既存の観察画面：<http://127.0.0.1:3286/ai-lab>

このPCのloopback限定。`character-study` は `translucent` / `soft-flat` / `symbolic-flat`。実画面の上部でA/B/Cを切り替え、サンプルを折り畳み、比較一覧へ戻るか比較を終了できる。サンプルは本体64px・コメント横20px。配置場所の正式決定ではない。

## 実装と観察

組込ImageGenで3点を生成し、元画像を保全して `prototypes/official-ai-character/assets/` へコピーした。Aを新規生成、BはA、CはBを参照。すべて1254×1254 RGBAで、alpha値0〜255を既存sharpで読み取り確認した。画像加工・外部API用スクリプト・共有Kevは使用していない。[生成プロンプトと原本名](../../prototypes/official-ai-character/PROMPTS.md)。

比較画面は明暗2背景と128/64/48/20/18/16pxを並べる。公式AIをパトロールAI・探索者見習いAIと別個体として説明し、探索者のアバターや履歴には適用しない。実Home・Graphのコピー上では、明示操作で「配置サンプル · 投稿・応答ではありません」を表示する。会員記録・投稿・AI実行・学習の実績を作っていない。

目視ではAの内部の重なり、Bの穏やかな色面、Cの簡素な輪郭が比較できる。16pxでは通常画像の余白とアンテナを含めて縮小するため、どの案も顔と接続線が細い。極小用デフォルメは未作成。Cを含む生成画像に微細な色むら・縁が残るので、単色ベクターや正式アセットとして扱わない。静止案の採用・名前・動きは人間の次の選定事項として維持する。

## 検証結果

| 確認 | 結果 |
| --- | --- |
| 生成Next.js 16.3.8 webpack production build / TypeScript | 成功 |
| 比較画面：1440px・390px × light・dark-blue・dark-brown | 6条件成功、横はみ出しなし |
| 各条件の3案 × 実Home／Graph | 36表示成功、切替でGraphのノード集合を維持 |
| 明暗切替・表示サイズ・画像読み込み・静止 | 成功、CSSアニメーションなし |
| 明示開始・案の切替・折り畳み・終了後reload | 成功、通常の初期URLにキャラクターを表示しない |
| 探索者との分離 | `/ai-lab` に公式AIの配置サンプルを表示しない |
| ブラウザ通信 | 比較検証中はGET/HEADのみ、Kev・推論API通信なし |
| 既存ラボ回帰：日英 × PC／スマホ | 4条件成功。Home・Graph・Claim・アカウントへの往復、スクロール・Graph配置・ズーム・パン復元 |
| 既存API境界 | 書き込み／推論パス404、会員接続503、Host拒否・CSP・非公開ファイルの拒否・レビュー資料取得を確認 |
| JavaScript実行例外 / git diff --check | なし |

実行コマンドは [試作README](../../prototypes/official-ai-character/README.md)。全42枚の比較スクリーンショットは `/tmp/plunode-character-v02-20261022/`、代表4枚をこの記録と同じGitに保存した。

| 比較一覧 | 実Home・Graph |
| --- | --- |
| [3案・明暗・全サイズ](official-ai-character-20261022/comparison.png) | [Home・明](official-ai-character-20261022/home-light.png) |
| [スマホHome・暗](official-ai-character-20261022/mobile-home.png) | [Graph・暗](official-ai-character-20261022/graph-dark.png) |

## 既存作業の保全

共通Autopilot lockを取得し、tokenでreview／assert-heldを行って変更・検証した。main／origin/mainは `bdb682b89942557ea2fa993c3e2b6e1736e723ec` のまま。既存 `memo.txt` を保持。Autopilotの固定確認SHAは `5c357e440d45b95e6fd3325bfd36c8fed3162b46`、未反映0・自動側dirtyなし。今回の作業で受入・確認済み化・スケジュール変更はしていない。既存の `autopilot-status` のPowerShell null式エラーは継続し、この試作の範囲で修正していない。

生成元の `app/`・`components/`・`lib/`、コミュニティ側の作業、AIラボの課題・採点案・実行記録、共有Kevは変更していない。稼働確認用3286の自身のプレビューだけを再build／起動。main統合、3200・beta・本番への配置、VPS変更は実施していない。新しい共有URLや外部公開も作っていない。
