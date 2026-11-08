# テーマ訳文の表示接続とスマホ見出し

2026-11-09。写真のTOP紹介テーマは、Theme summaryの原文を直接表示しており、公開済み訳文が中央見出しへ出てもカードには出なかった。検索・新着・関連テーマも同じ不足があった。詳細の本文／対象名も一部原文の直表示だった。

## 対応

公開テーマ一覧へ、既存の公開訳文の版・原文・可視性検査を通した日本語／英語の表示データを同じ応答に添える。SSRのTOPも同じデータを使い、カード単位の追加通信や訳文生成は行わない。紹介・新着・検索・関連テーマ、テーマ詳細・記録詳細で言語に合う登録済み訳文を利用し、未登録時は原文へ戻す。原文や構成版・保存断面を書き換えない。引用・原資料の時期ラベルは原語を保持する。

スマホのテーマヘッダは、戻る／操作の段と幅いっぱいのタイトルを分ける。タイトルを省略固定せず折り返し、戻る文字と3アイコンに押し縮められない。PCの横並びは維持する。

## 検証と配置

対象UI16件・分離DB/MCP18件（合計34件）、変更対象lint、両方のwebpack buildと型検査に成功。カタログの原文保持・同じ版の訳文・公開停止除外、英語表示／日本語・旧版fallbackを含む。追加した試験のWorker呼出引数を既存helperへ合わせて再実行した。初回のUI試験が`.local`内の古い複製まで列挙したため、その実行は中断し、除外して対象3ファイル16件だけを実行した。これらはアプリ障害ではない。

アプリ `bbd9503cdf7adb237bf3a1117605379573d8f439`、β build `TsVq7vQb6n5X9cGPCLM3o`、正式候補build `S36Jte03E0skpM32EgDrk`。main／作業ブランチへ通常push済み。localhost3200へ配置し、14 private設定・Worker PID・会員migration39／β知識8のchecksumを保持、移行なし。旧buildはignored backupsへ保持。HTTPS βはWindows HTTP200、初期HTML内の英訳と実ChromeのTOP紹介カードを確認。WSLからのHTTPS probeはCloudflare403で、Windowsとブラウザの結果と区別した。

Chromeの実viewportを390×844へ設定し、対象ヘッダのタイトル幅が旧約97px→354px、英題 `Webb’s Journey to Unfolding in Space` の表示、折返し・横はみ出しなしを確認。通常PC1920pxへ戻してタイトル幅約874px・横はみ出しなしを確認した。任意のviewport指定は解除済み。βのタイトル訳は既存の公開訳で、この試験のためのAI送信や新しい訳文は登録していない。写真の未訳年表行などは登録済み訳文があれば使い、未登録の本文・時期ラベルを勝手に翻訳しない。

正式候補image tag `plunode-web:theme-locale-bbd9503c`、config `sha256:b802fb24d23de021d2408e77dc630f09c45ad89c54c03551899f01642a0e8e5b`、manifest `sha256:e64c68c7617631f7f9d9cd0a38841fb3dfca4df296f27408a893f1eee5a2ce45`。standaloneのrobots HTTP200・正式build ID・既存AIラボartifact hashを照合。archive全layer・config・manifestを検証し、VPSへ転送後の全checksum一致も確認した。直前app bc486903／正式build RWsvoeFimf3i8iA3_oAfHを前提に、既存のWeb-only切替契約を使う。DB移行／Worker／OSの更新は不要。

切替前はVPSのsudo入力を待ち、正式TOPの英訳・スマホ見出しの確認を残していた。実行用は `/home/isinxnisi/1.projects/7.graph-knowledge/backups/theme-locale-mobile-20261109/run-release.py`。同じコマンドが共通guardを取得・解放し、Web設定のbackupと直前の互換Webへの復帰手順を保持する。


## 正式反映と実画面確認（完了）

2026-11-09、本人のsudo実行により、同じ固定アプリ `bbd9503cdf7adb237bf3a1117605379573d8f439`／正式build `S36Jte03E0skpM32EgDrk`／manifest image `sha256:e64c68c7617631f7f9d9cd0a38841fb3dfca4df296f27408a893f1eee5a2ce45` へWebだけを切替。backupは `/opt/graph-knowledge/backups/theme-locale-web-20261108T232210Z`（11月9日08:22 JST）。activated記録をSSHで読み戻し、会員39／知識9の全migration不変、Worker・既存設定・KG・AIラボartifactの保持とDB復元なしを確認した。

正式 `/en` のHTTP200と初期HTML内の英訳タイトル、当該build manifestのHTTP200を確認。実ChromeでTOPの紹介テーマのタイトル・説明が公開英訳となり、同じカードからテーマ構成版6へ進めた。390×844の実viewportで英題 `Webb's Journey to Unfolding in Space` を表示し、タイトル幅354px・white-space normal・ページ横はみ出しなしを確認。年表でも公開済みの1989年／1996年の本文などは英語になった。未登録の年表見出し・時期ラベルなどは原文のまま。追加のAI送信・訳文登録はしていない。

viewportを1920pxの通常幅へ戻し、従来の横並びと見出し幅約874px・横はみ出しなしを確認。右の詳細も同じ英訳タイトル・説明と構成版6を表示した。Chromeでスマホ相当幅を確認した結果であり、iPhone実機のChromeを遠隔操作した検証とは区別する。

確認先は [正式英語TOP](https://plunode.net/en) → 紹介テーマ、または [Webb構成版6](https://plunode.net/en?ktheme=theme%3A915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1&krev=6&kview=split)。日本語表示では日本語原文を使い、公開済み英訳がある項目のみ英語表示へ切り替える。

localhost3200／HTTPS β／正式VPSはいずれも同じアプリsourceまで反映済み。β buildは `TsVq7vQb6n5X9cGPCLM3o`、正式buildは `S36Jte03E0skpM32EgDrk`。正式反映後は記録のみの追記で、不要な再build・再配置をしない。今回の3工程は完了。
