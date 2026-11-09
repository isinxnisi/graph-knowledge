# 公開探索の多言語表示是正

2026-11-09。現在地：①原因確認・②修正／検証・③localhost3200／HTTPS βの配置と実画面確認、本番資材転送照合まで完了。残りは③sudo切替と正式URL確認。今回は③まで。正式反映はまだ完了していない。

## 原因と範囲

正式英語TOPで添付画像と同じ日本語の対象名・新着・Theme版8を再現した。旧KGのsummaryは別名を落としており、各画面は原名を直接表示していた。Theme版6と8のタイトル・説明は同一だが、訳文は6に結び付いていたため、新しい構成版のカードで出なくなっていた。

[表示契約](../design/MULTILINGUAL_DISPLAY_COVERAGE.md)に従って、登録済みの別表記・確認済み訳文・原文を分け、TOP／開始例／検索／Graph／詳細／関係・経路／公開対象の名前表示を共通化した。Themeの同一原文は公開状態と全中間版を照合して表示上継承し、英訳による検索・表示言語での名前順を接続した。DB migration・データ補修・AI送信はしない。

## 実施済み検証

- 新規11境界を含む対象5ファイル26件が成功。名前選択のcallbackが元Entityのまま、Graphの同名識別、Theme原文の変更／復元／言語変更／項目削除／非公開と現在版の停止を確認。
- 変更対象lintと型検査成功。追加の既存検索・Graph・domain等は92件成功。`content-locale.test.tsx`の3件は古いUIやmockを参照して失敗し、未変更mainでも同じ3件の失敗を確認した。今回の成功件数へ混ぜない。
- βの既存PGをREAD ONLY接続で読み、新しいTheme公開readerの3テーマ・英題1件・同じ英題での検索1件を確認。schemaの適用や原本の更新をしない。
- 最初の追加回帰ではimportの重複を検出して修正し、対象26件を再実行して成功。mainの比較試験がignored backupも拾ったためその実行だけ中断し、backupを除外してmainの1ファイル6件に限定して再確認した。

## 配置と実操作

- アプリsource：`39a84f4e1d64c12a5fb6c0f8f8e5b268dbf4a9b4`。実装修正は`21af3042`と`39a84f4e`で作業ブランチ／mainへ通常push済み。
- localhost3200／HTTPS β：build `lVThmoAMxlkrjkNqtWTne`。Webのみ更新し、private設定14件、Worker PID、会員39／知識8 migration checksumを保持。DB migrationなし。旧buildは`backups/multilingual-20261109/next-before-20261109T192539`へ保管。
- 正式候補：build `7EFviEW9P6SUyGSaqGPRm`、image `plunode-web:multilingual-39a84f4e`、config ID `sha256:4c40ffb94bd9a399e875ffc5e1003e56b08b60591f5e7fa1f0f40e46ec3023ae`、manifest ID `sha256:cd73aabb66764823327ee3d3ef3bad646e082acf2dd51636acc872b8f5296e25`。両buildは型検査込みで成功。
- 正式imageを既存の正式確認用KGへ接続する一時containerで起動し、`GRAPH_DEPLOYMENT=production`の英語TOP 200、public-kgのrevision応答、β URL混入なし、build IDと既存AIラボartifact hashの一致を確認。portは公開せず、GETのみ実行してcontainerを除去した。最初はDBなし、次に未使用の7694を接続先にしたテスト設定で失敗したが、稼働中の正式確認用DBへ正しく接続した試験は成功。アプリやDBをこのために変更していない。
- βのChrome実画面で、英語TOPのPLUTO制作者、他の対象、新着Entity／関係の端点、探索候補、通常Graphの起点・ノード・関係一覧・対象詳細を確認。`Takashi Nagasaki`を押して同じEntityの探索へ進める。英題`Webb’s Journey`でテーマ検索1件と遷移先を確認。
- 390pxの英語探索候補・TOP、日本語へ切替後の人物名とテーマ原文を確認し、両言語で横overflowなし。一時viewportを解除した。PC画面も確認。実Googleは既存ログイン状態を使い、認証設定を変更していない。
- βのテストテーマには英訳自体が未登録の説明・題名がある。それが原文で残ることと、今回の表示接続漏れを区別した。正式Theme版6→7→8は同じ原文と宣言言語であることを読取確認済みだが、新Webでの正式表示は切替後に確認する。
- スクリーンショット：`C:/Users/nishr/.codex/tmp/multilingual-beta-top-20261109.jpg`、`multilingual-beta-search-20261109.jpg`、`multilingual-beta-graph-20261109.jpg`、`multilingual-beta-mobile-search-20261109.jpg`。後ろ3件も同じディレクトリ。

## 本番切替・再開

`scripts/release-multilingual-production.py`は既存Webのみの公開手順を基に、現在のapp9d39f7d2／build `f-Ryn5yWRD-CNjoPfInPS`を照合する。private設定、会員39／知識9のchecksum、Worker／KGのcontainer、AIラボartifactを保持し、Web設定のbackup後にWeb imageだけを切り替える。DB復元・schema移行・Worker／OS更新を行わない。失敗時は互換性のある直前Webのみへ復帰する。

資材を`/home/develop/plunode-multilingual-20261109/release-39a84f4e`へ転送し、archive内のconfig／layer／sourceと転送後checksum、runnerの`--check`を確認。sudo操作は未実行。

本人入力用：

```powershell
wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/7.graph-knowledge/backups/multilingual-20261109/run-release.py
```

終了後、activation結果と正式英語TOP／探索候補／英題検索／同一Theme構成版8の訳文継続・原文を確認する。共有やCapsuleの固定断面は書き換えない。

## 未確認・制約

正式Webの切替と正式URL確認を残す。英語の別表記や訳文自体が未登録の知識、原資料の引用・題名、ユーザーの自由文・外部広告を新しく全件翻訳する作業ではない。旧KG原文は保持する。今回確認した公開探索経路以外の全画面・全データの英訳完了とは扱わない。
