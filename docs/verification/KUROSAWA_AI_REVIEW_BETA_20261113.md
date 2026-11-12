# β：黒澤テーマ5項目のAI審査復旧（2026-11-13）

## 到達点

①停止原因調査・②通信／準備回数管理の補修・③βの通常審査と公開確認まで完了。

- request `f554935a-bcb2-4d67-b01f-bfb90377f456`、receipt `4cab5e05-a788-4173-b058-aa5df22a1b57` を維持。
- 対象のG01／G04／G03／G02／G05は全て `published`。各1回の実AI審査（既存モデル `gemini-3.1-flash-lite`）で通常公開まで完了。
- 原資料取得・引用hash・実応答・モデル／利用量・通常の受理結果・公開状態をDBで確認。既存β Appの `get_theme_registration` でも5項目published／各requests=1を再確認。
- T01／T02／D02／T03とG07は状態・理由・入力・prepare回数等の全項目列が開始時と同一。対象外として変更していない。
- テーマ受付全体は `processing`、theme=null。除外した入力不足4項目とG07が残るため、テーマ一式の登録完了ではない。重複テーマは作成していない。

## 原因

β自動整理WorkerからGeminiへの通信が `ETIMEDOUT` で継続失敗。保存済みorganization-proposeの直近8試行が同じtimeoutで、review_projectsに共通の接続待ちを設定していた。同じprojectを使うテーマ確認はAI枠の予約前に待機となり、対象のAI送信は0回だった。Googleへの認証なしHTTPSでも、WSL Nodeは約2.2秒でETIMEDOUT、Windows側は正常にHTTP404応答を取得した。無料枠の消尽やAPIキー誤りを原因とする応答ではない。

さらに、`knowledge-import`は原資料確認後にAI枠を予約できず待機した場合もprepare_attemptsを消費していた。このため送信0回でも準備回数上限に到達した。前の原資料補修で残した5項目の通常Worker snapshotから、それぞれ最後の1回が共通接続待ちによる誤消費であることを確認した。

## 修正

- βの既存明示設定・固定originに限定したGemini POST通信を追加。指定済みのGoogle generateContent endpointのみへ送信し、TLS検証・公開IPv4のDNS検証と固定・転送禁止・128KB入力／2MB応答・callerの時間上限を維持する。
- APIキーと送信wireはWindows curlのstdinだけに渡し、argv・一時ファイル・ログへ出さない。汎用POST proxy、別providerへのfallback、SDK内再試行は追加しない。
- `callGeminiReview`の既存単一試行／実応答・429／503／認証失敗／応答不明の扱いは保持。注入済みfetcherと本番のnative fetchも維持する。
- AI枠の予約がwaitになった時だけ、同leaseで増えたprepare_attemptsを1戻す。実際の準備失敗・送信回数・AI台帳・日次／月次／分単位の制限は維持する。待機を9回繰り返しても準備回数が増えず、解消後に通常送信できることを別DBで検証。
- βのreview／patrol／AI readerを既存の私有設定で再起動。Patrolには起動時点の古い環境に明示transport flagがなかったため、既存launcherが検証した現在の設定を引き継いだ。正式PC Worker、Kev、本番VPSは変更しない。

## 同じ受付の再開と保全

- 確認済みのローカル接続障害によるcooldownだけを解除。最後の共有project試行がorganization-propose／delivery-unknown／ETIMEDOUTであることを照合してから行った。429等のprovider制限を解除する操作ではない。
- 対象5項目だけ、誤って消費した準備待機1回分を8→7へ訂正して通常queueへ復帰。7回分の実準備失敗と、過去の送信／応答不明の利用量は保持。原資料の再照合・AI審査・自動受理・publisherを通常どおり通した。判定や公開状態をSQLで強制しない。
- 途中の2項目は通常の分単位利用制限で待機した。待ち時間・上限を変更せずに5/5完了を確認。
- 受付input（画像参照を含む）・全10項目のinput_digest／normalized、除外5項目の全列が保持されたことを照合。既存AI設定ファイルとproject config_digestも同一。画像・商品は登録／削除／差し替えをしていない。

| key | 原資料 | AI送信回数 | 最終状態 |
| --- | --- | ---: | --- |
| G01 | JFDB | 1 | published |
| G04 | JFDB | 1 | published |
| G03 | Lucasfilm | 1 | published |
| G02 | 国立映画アーカイブ | 1 | published |
| G05 | 国立映画アーカイブ | 1 | published |

## 検証・配置

- 通信・審査clientの24件と、専用の一時PostgreSQLによるimport／予算境界の39件、計63件成功。対象eslint・型検査込みbuild成功。試験containerは既存runnerの通常cleanupで削除し、βのDBをfixtureとして使っていない。
- build `U6iCFUid7NzBsoPe811rF` を3200／HTTPS βへ配置。両TOPがHTTP200、既存β Appで同一受付の最終状態を取得。
- Web停止待ちの5秒確認が一度先にtimeoutした。候補を保持したまま旧process停止とport閉鎖を照合し、その後に候補へ切替・復帰。旧runtimeも保持。DBの巻戻し・初期化はしていない。
- DB migration、利用枠の数値変更、課金設定変更、MCP定義変更、本番反映なし。UI変更がないため、追加のブラウザ画面／iPhone実機検証は実施していない。

対象5項目に本件の残作業なし。テーマ全体は対象外5項目の解消後に通常処理で完成させる。
