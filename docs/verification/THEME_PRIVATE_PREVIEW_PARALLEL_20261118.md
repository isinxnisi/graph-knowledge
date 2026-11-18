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

正式build `mX9TdhOPP4-HTYKQJpGhD`、Web `plunode-web:theme-manual-2f2dbfaf`。Docker classic保存物を同一config／全layer bytesを照合したOCI layoutへpackし、既存検証器で全blob digest・layer binding・source labelを検証、local Docker loadも成功。正式stageへ転送し、現地SHA256を照合済み。

本番は同じ固定source2f2dbfaf／build mX9TdhOPP4-HTYKQJpGhDへ反映・復旧済み。member046だけ追加しledger47、knowledgeは既存10を維持。Webだけimage変更、既存3 Workerは52の同じimageで再開。一般公開の本文・画像・商品・共通知識・品質ガイド・予定は変更していない。切替前backupの隔離復元で旧row／owner保全・再実行不変を確認し、切替時にも両DBの保持検査が成功した。

正式HTTPS18経路ではTOP・公開catalogue・日英承認21版・OGP・sitemap・robotsが200、作業22版の公開API／日英krev指定・匿名operator経路は404。凍結workbenchの`/themes`は従来のguardにより404で、稼働中の公開Theme一覧API／TOPとは別契約。正式の実Chromeでもログイン済み運営者はプレビュー22版とヘッダ直下の案内を確認できた。DevToolsの表示サイズ操作だけでiPhone SE 375×667幅の日英も確認し、案内・ヘッダ・本文が収まり、下部の切替UIも表示された。別temporary headless browserの匿名1280px／375px・日英4経路でも、承認21版・html言語・横overflowなし・pageerror0を確認した。これはPCブラウザでのエミュレーションであり実機iPhoneの確認ではない。検証後はdevice emulationを解除してDevToolsを閉じ、ブラウザ表示を戻した。既存正式Appからガイドv3とmanual入力schemaを実読し、既存App管理の「ツールを更新」を実行、ボタン復帰・エラーなしを確認した。App ID／endpoint／OAuth scopeは維持。host側でmanual案件を実際に作成・編集する本番書込み、ChatGPT Webの予定実行は検証操作として行っていない。

本番容量のread-only集計は[容量報告](DATABASE_CAPACITY_20261118.md)へ記録した。知識DB12.43GBの約98.984%は公開投影／巡回一覧、revisionは約0.066%。削除やindex整理は実施していない。

DQは予定実行によって承認公開21版・作業22版へ進行していた（今回の検証時点）。再非公開化は行わず、正式確認ではその時点の承認版を一般公開、作業中版を運営者限定として検査する。

## 実施した本番手順と復旧

既存sudo本人入力を必要とする `backups/theme-manual-production-20261118/run-release.py`。strictな現行Compose chain・設定hash・image・build・ledger確認後、稼働中member backupの隔離復元で046・全旧column/row/owner保持・再適用を確認する。切替時はWeb／3 Workerを停止し、両DB・private設定・checkpoint・旧imageのbackupと暗号化を行う。member046だけ適用し、Webだけimageを変更、Workerは同じimageで再開。正式API／画面検証・暗号化backup回収と復号検証も実施した。

member046後に旧Webへ自動downgradeしない。旧Webはmanual案件の既定選択に対応しないため、問題時は新schema／公開境界を保持して前進復旧する。旧dumpへの自動復元・データ削除は行わない。権限／照合の不一致は変更前に停止する。


## 配置確認エラーと復旧（完了）

最終確認でNode fetchからloopbackへ呼んだ公開APIがHost許可検査で403となった。配置scriptがreadiness失敗としてWeb／3 Workerを停止するため、正式originが502となった。アプリ本文や046の問題ではなく、配置チェックの実装ミス。migrationと旧row／owner・共通知識の保持検査は、この最終確認より前に成功済みだった。

Hostを指定したfetchもNode24では意図したHostを送らないことを実HTTP serverで確認した。Node HTTPへ切り替え、正式Host plunode.netで検証。同じsource・image・schemaとbackupを照合する専用repair手順でWeb／同じWorkerを再開し、公開API200を確認した。DB再移行・復元・旧版downgrade・本文更新は行っていない。今後のrelease手順では停止前の正常Webでも同じ確認を行う。実HTTPによるHost／HTTP403／不正JSONの回帰3件を追加し成功した。復旧手順は後続のread-only確認が失敗しても、検証済みの新Webを再停止しない。

backup `/opt/graph-knowledge/backups/theme-manual-20261118T125110Z`。暗号化902,440,992 bytesと鍵envelopeをPCへ回収・ハッシュ照合。秘密鍵による復号・tar読取・member/knowledge両custom dumpのPGDMP header・manifest source一致・private設定同梱を確認した。平文の設定・DB dumpはPCに展開・永続化していない。暗号化SHA c0892b7fefb294a9fe8a3dfdc6328519cf1ff6d4b225e4b92c02018ace7c2c7a、鍵SHA dc0fc66e58815b8c86ed86baeaffe6c666f2ebb6044487aca505eb5337187219。

運営画面の正式実Chromeでは、Theme production入口がSiteHeader上ではなく既存Operations navigation内に配置されていることも確認した。既に外部へ配信済みの本文・画像・検索snippetの即時消去は保証せず、Google Index／第三者cacheの再反映は未確認。現在の公開canonicalは承認21版を提供し、作業版のkrev/API指定とoperator URLを認証・公開版gateで保護している。

追加で、現在privateのVikingテーマ1版を正式の運営者Appから読み取り、publication.private／publishedRevision=nullを確認。匿名の日英canonical・krev指定・公開API／版指定・日英OGPは404、catalogue／sitemapから除外し、同テーマの共通知識Record版は200を維持した（追加11経路）。正式HTTP確認は計29経路、公開PC／375px日英描画4経路、運営者実Chromeの日英プレビューを確認した。

運営一覧に、Vikingの既存受付72fb7d86...の項目修正が「許可範囲外のテーマです」となった制作残件が記載されていた。今回その受付の送信・修正・再試行や本文の変更は行っていない。実payloadと当時の権限を照合していないため、この記載だけでprivate公開境界や今回の並行制御を原因とは断定しない。別の既存受付残件として区別する。
