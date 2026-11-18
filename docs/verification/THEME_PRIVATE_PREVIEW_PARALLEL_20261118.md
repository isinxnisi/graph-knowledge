# 運営者プレビュー修正・定期制作と手動編集の分離（2026-11-18）

## 実装と原因

運営者プレビュー404はNextのencoded route paramを検証前に復号していなかったため。既存のpublic ID decoderを使い、二重encode・不正ID・path injectionは拒否する。制作入口をOperations内navigationへ移し、プレビュー案内をSiteHeaderの直下へ配置した。英語queryのSSRとhydrationのlocaleも一致させた。

並行編集の妨げは長時間のDB transactionではなく、044のowner/environment単位の唯一の未完了案件indexとcreateの拒否。定期実行の逐次運用を全チャットへ広げていた。046で既存全案件をscheduledのまま保持し、manualは別テーマで並行可能にした。未完了の同一テーマの案件は重複させず、所有者・入力版・lease・fence・冪等性・独立見直し／承認公開は維持する。普通のupdate_themeは従来から別requestIdによる直接更新が可能で、今回は主に制作案件の開始／再開と完成処理の妨げを除いた。

定期実行のcreateでworkflow省略、get/claimでcaseId省略は従来のscheduled選択を維持。通常チャットはcreate_theme_productionにworkflow: manualを指定し、返されたcase.idをread/claim/update等で明示する。新規tool、Worker、cron、予定変更、品質基準追加はない。既存6操作とguide(version3)のschema／説明を更新。

## 検証

- 隔離DB：制作28・MCP4の32件。旧044/045の案件、lease、progress、保存wireの保全、046再適用、scheduled稼働中のmanual作成・別テーマ更新・見直し・承認公開、scheduled既定選択を確認。
- 同一Themeの案件競合、失効lease、旧版、権限、保存送信のfence／冪等性を維持。
- 運営訳文と一般投稿30件成功。運営AI送信0・一般投稿20件/時等の既存制御を維持。
- 最終MCP／preview page／locale 16件成功、変更箇所lintと型検査成功。
- 最終Web image mX9TdhOPP4-HTYKQJpGhDを抽出した使い捨てWeb・会員PGで、未認証／一般会員はJA・EN・旧版404、運営者は200、noindex/no-store。別のtemporary headless Chrome profileで1280px／390pxの日英を描画。header底53pxと案内先頭53pxが一致、横overflowなし、pageerror0。実利用Chrome profileのcookie／内部情報は抽出していない。
- β HTTPS匿名15経路：dataset／catalogue／sitemap200、private Theme API・旧版・日英canonical・OGP・Theme画像・operator経路・関連商品404。非公開title漏洩なし。
- 実Chromeでβのログイン済みプレビューが表示でき、ヘッダ直下の案内を確認。既存β Appからget_theme_authoring_guideのversion3とmanual入力schemaを読み取れた。ChatGPTの既存β App管理で「ツールを更新」を実行し、ボタンの復帰とエラー表示がないことを確認。host側create/claimによる実manual案件操作は行っていない。
- QA用Web／使い捨て会員PGだけ終了・削除。実Theme・案件・登録・予定は検証操作で変更していない。iPhone実機とChatGPT Web予定実行は未検証。

## 配置状態

固定アプリsource `2f2dbfaf28abb80d5cf0d1808d539fcc99dd9c29`（先行実装92447383、MCP説明2f2dbfaf）。β build `VWTlkSw0YFV0JDhiQgcpK`へ反映済み、member ledger47／knowledge9。046だけ追加し、旧rowの比較で保持を確認した。

正式候補build `mX9TdhOPP4-HTYKQJpGhD`、Web `plunode-web:theme-manual-2f2dbfaf`。Docker classic保存物を同一config／全layer bytesを照合したOCI layoutへpackし、既存検証器で全blob digest・layer binding・source labelを検証、local Docker loadも成功。正式stageへ転送し、現地SHA256を照合済み。

本番は52aeced6／mX5Ty2YU9Jw7NlYdW8llVのまま。migration046・Web切替・本番preview確認・正式App更新は本人sudo入力待ちで未完了。既存3 Workerは同じ52 imageを再開し、knowledge migrationやguide／本文／画像／商品／予定の変更は行わない。本番DB容量も同じ本人操作の切替前にread-only集計し、[容量報告](DATABASE_CAPACITY_20261118.md)へ追記する。

DQは予定実行によって承認公開21版・作業22版へ進行していた（今回の検証時点）。再非公開化は行わず、正式確認ではその時点の承認版を一般公開、作業中版を運営者限定として検査する。

## 本番手順と復旧

既存sudo本人入力を必要とする `backups/theme-manual-production-20261118/run-release.py`。strictな現行Compose chain・設定hash・image・build・ledger確認後、稼働中member backupの隔離復元で046・全旧column/row/owner保持・再適用を確認する。切替時はWeb／3 Workerを停止し、両DB・private設定・checkpoint・旧imageのbackupと暗号化を行う。member046だけ適用し、Webだけimageを変更、Workerは同じimageで再開。正式API／画面検証・暗号化backup回収は切替後に続行する。

member046後に旧Webへ自動downgradeしない。旧Webはmanual案件の既定選択に対応しないため、問題時は新schema／公開境界を保持して前進復旧する。旧dumpへの自動復元・データ削除は行わない。権限／照合の不一致は変更前に停止する。
