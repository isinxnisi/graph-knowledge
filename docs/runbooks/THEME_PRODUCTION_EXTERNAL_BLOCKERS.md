# テーマ制作の画像登録と認証済みプレビュー

## ヴァイキング案件の切分け

対象は正式案件 `4c649f02-a749-4ccd-822b-ddba9757d8fc`。正式APIの取得では見直し工程が `blocked`、版14、未反映の送信0。案件中の11月18日の一次診断には、生成された正規添付をコネクタが `BLOCKED_FILE_REFERENCE` で拒否し、`imageId` が発行されなかったとある。認証済みプレビューの阻害要因は接続元ブラウザの不足。どちらもWeb予定の保存済み文面からの推定ではなく、案件に保存された実行記録。

正式の画像受信コードに `BLOCKED_FILE_REFERENCE` の生成箇所はない。Plunodeの添付URL拒否は `FILE_REFERENCE_INVALID`、取得失敗は `FILE_DOWNLOAD_UNAVAILABLE`。既存の記録と実装は、ChatGPT側の添付送出での停止を示す。旧Webのアプリログと正式プロキシの要求記録の照合は管理者権限が必要。読取結果の記録が無い場合は、アクセスログの有無とコンテナの保持期間を確認し、未到達の証明には使わない。

このPCのPowerShellから、対象期間の集計を取得する。入力するのはVPSのsudoパスワード。共有するのは集計JSON。署名付きURL・file ID・本文・認証情報をログや報告に複製しない。

```powershell
wsl.exe -d Ubuntu --cd /home/isinxnisi/1.projects/7.graph-knowledge -- python3 scripts/inspect-theme-image-ingress.py --since '2026-11-18T00:00:00+09:00' --until '2026-11-21T00:00:00+09:00'
```

新しい正式Webでは認証済み `tools/call` の画像受付に `Editorial image MCP received`、画像取得・保存に失敗すれば `Editorial image MCP rejected` と段階・エラーコード、保存成功に `Editorial image MCP stored` を記録する。相関にはUUIDの `requestId` を使う。SDK入力検証が失敗しても受付を記録する。認証で拒否された要求では本文を読み取らない。将来の照合では実行時刻と、値が分かる場合は受付UUIDを使う。

## 画像登録の選択

| 経路 | 使える条件と判断 |
| --- | --- |
| 通常Chatから本番Appへ正規添付 | 既存の `upload_editorial_image` を使用。生成画像を実際の添付として選択でき、ChatGPTがその実行で送出を許可した場合に試す。成功した `imageId` を案件へ引き継ぐ。定期枠の添付送出とは別の確認 |
| 運営者のブラウザから元ファイルを登録 | 元ファイルを本人が取得できる場合の復旧経路。下記の工具は既存の運営者認証、Origin照合、multipartの画像検査・不変保存・再送契約を利用する。画像の登録だけを行う |
| 定期実行で登録済みの画像を再利用 | 確認済み素材の `imageId`、利用条件と画像の役割を案件に保存し、既存のprepare・dispatchによるテーマ更新で関連付ける。既存枠を維持できる。初回の素材登録は必要 |
| 新規生成物の完全自動登録 | 添付送出が定期実行で利用できることを実測するか、別途承認を得た生成・素材取得サービスから検査済みの実バイトを既存の認証済み取込につなぐ。後者は秘密管理・素材の権限と履歴・容量・費用・再送を設計した上で別途導入する |

現在の `BLOCKED_FILE_REFERENCE` に対し、同一条件の再送はしない。短命な参照を組み立てたり、任意の外部URLを許可したりする変更は不要。定期枠の添付送出が回復したことは未確認。

## 運営者ブラウザの準備と実画面の検証

WSLのNode 24、PlaywrightのChromiumと共有ライブラリ、初回サインイン用の画面表示環境を使う。リポジトリのルートで以下を実行し、開いた専用ブラウザで運営者としてログインしてからEnterを押す。プロファイルは環境ごとに `~/.local/state/plunode-theme-review` の所有者専用領域に保存する。

```bash
node --import tsx scripts/review-theme-browser.ts login https://plunode.net
```

画像の復旧に使う場合、メタデータJSONには画像を識別する新規UUIDの `requestId`、日英の `alt`、`provenance` または既存の `provenanceId` の一方を入れる。本人が取得した元ファイルを指定して実行する。同じ画像・メタデータの再送は同じUUIDを使う。

```bash
node --import tsx scripts/review-theme-browser.ts upload-image https://plunode.net "$image" "$metadata"
```

レビューは案件の `evaluationTarget.theme` と `evaluationTarget.digest` から正確な対象を指定する。必要な言語ごとに実行する。

```bash
node --import tsx scripts/review-theme-browser.ts review https://plunode.net "$themeId" "$revision" ja "$evaluationDigest"
```

運営者APIの非公開ヘッダー、正確なテーマIDと版を照合してから、既存の非公開画面を幅1440pxと390pxで開く。同じレポートとスクリーンショットに画像の実寸・表示寸法と `object-fit`／`object-position`、画像の拡大、年表・Storyから引用を開いて戻る操作、画面の横あふれを残す。採取前後のAPI応答を照合し、証拠が不足する場合はコマンドを失敗終了にする。実機や絵の見え方の評価はスクリーンショットを独立に確認する。資料・画像が不足している状態を合格にしない。

レポートと画像は運営者の非公開資料として扱う。独立見直しへ共有できる承認済みの経路を使い、ブラウザのプロファイルやセッションを共有しない。採取時の `requestedEvaluationDigest` と現在の評価対象digestを見直し側でも照合する。現在の工具はローカルでの証拠収集までを担い、Webの定期見直しへの自動配送は別途接続が必要。

## 停止・再開とChatGPT Webの引継ぎ

1. 既存案件と工程を保持して `blocked` を保存する。阻害要因ごとにエラー、観測時刻、対象の素材・版、再開に必要な具体的条件を記録し、待機中は実行権を解放する。
2. 画像なら登録済みの `imageId`、プレビューなら現行対象に一致する認証済み実画面の証拠が得られたときに再開する。同一条件での添付再送や接続元のないBrowser操作を繰り返さない。
3. 次の実行は同じ案件を取得し、現行工程で新しい実行IDと実行権を取得する。保存済み送信と受付は既存IDで確認し、追加修正は既存のprepare・dispatchで送る。解消を確認した項目だけを阻害要因から外す。新しい版が反映されたら証拠を取り直し、独立見直しで現行digest・ガイド版に対する全体評価を記録してから `complete` する。
4. 00分の制作と30分の独立見直しにこの再開条件を引き継ぐ。20分の資料収集は既存経路を使う。ChatGPT Webに保存された設定・文面はCodexから変更していない。正式Webを更新する場合は新規の固定候補を共通公開手順で承認・検証し、更新後のガイドを読み戻す。

## 検証状況

隔離の制作・MCP 44件、画像受付・非公開プレビュー・Chromiumの対象操作24件、画像の検査と保存処理8件、運営登録32件、一般投稿64件が成功。Chromiumは検証用ページで幅1440px／390pxを操作し、誤った版を受理しないことも確認した。型検査込みビルド、対象ファイルのESLint、ログ補助のPython構文も確認。

開発PCの3200とHTTPS βに `c9030b8dcdc7ad79fd96b92cee69b72542fabcde`（build `l4ggiYTMO5haoHa8t7pih`）を反映。両URLで公開テーマ一覧はHTTP 200、匿名運営者プレビューはHTTP 404、no-store・noindex。β Appで更新後の技術ガイドの `externalBlockers` を取得。正式はWeb build `Z_Qv5CFufUf3HwEDuiPdL`。ヴァイキング案件の画像登録、運営者ログイン済みの正式実画面、定期枠からの証拠読取と再開は未確認。今回のコードを正式に反映する場合は新しい固定資材を承認する。

背景資料。[OpenAIのファイル入力仕様](https://developers.openai.com/plugins/reference#file-apis)・[ChatGPTの定期実行](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt)・[承認公開の現行契約](../design/THEME_PRIVATE_PUBLICATION_20261117.md)
