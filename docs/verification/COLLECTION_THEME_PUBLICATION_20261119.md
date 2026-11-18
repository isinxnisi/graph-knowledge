# 資料収集と制作・公開状態の分離 検証

## 現在地

①経路監査・②実装・③隔離回帰・④固定buildとβ反映／HTTPS／既存App読取まで完了。本番資材の転送・現地hash照合も完了。残り④本人sudoによる本番適用、正式URL／App／Webb公開状態の確認。

## 監査

正式App `read_theme` と、取得済み本番backupの隔離復元を比較した。Webbの公開28／head29、28→29のcontent差分は指定の受入noteのrecordPins一件追加のみ。28／29のcontentは現在Appと一致した。元operationは `knowledge-import:mission:a748c4c2-5d00-4747-b2f0-0d7ca5f99654`／request `26506f81-ac38-4b56-9748-352755a9d846`、対応する受入はpublishedだった。このbackup時点ではWebb制作案件はなかった。配置直前に現行DBを再検査する。

## 隔離検証

- 所有を確認した専用Postgresコンテナのみ使用。β／正式DBへテスト投稿していない。
- 主要回帰53件：新しい受入公開／作業分岐8件、既存制作案件・独立評価・権限・期限・公開保護と限定復旧31件、資料配送14件。復旧2件はfixture修正後の限定再実行で合格、他51件の合格記録と合わせて確認した。
- 運営登録のAI送信0回、一般配送への偽装拒否、資料取得失敗時のAI送信なしの既存3件が合格。収集の既存受入審査は決められた応答をstubし、実AIへ送っていない。
- 公開旧版維持、未公開原稿・訳文の保護、公開元からの知識追加、手動削除の保持、同時追加、同一requestId／新受付の同一pin再送、受入transaction中断と再試行、完了済み定期制作の継続、未反映／変更済み復旧対象の拒否を確認。
- 011の再適用でledger／既存行が変わらず、追記履歴のUPDATEが拒否されることを確認。
- 取得済み本番backupの監査用subsetを別の隔離DBへ再復元し、Webbの限定復旧check→apply→再実行が成功。公開29／head29／workingChanges=falseとなり、既存全revisionの内容hashを保持した。これは歴史backupでの試験であり、本番復旧完了ではない。
- API契約・受入計画等の既存単体18件も合格（DB付き翻訳7件はこの単体実行では対象外）。計74件合格。
- TypeScript型検査と変更箇所ESLint合格。検証原ログは無視対象の `backups/collection-theme-publication-20261119/` に保管。

## 反映と残件

本番の最新両DBbackup・全体復元／011反復・限定復旧のリハーサル、正式切替・App／公開GET確認が残る。通常ChatGPT Webの予定実行そのもの、iPhone実機の再試験は未確認。MCP操作名・入力／出力schemaは変更せず、get_theme_authoring_guideの説明を整合させたため、接続Appのツール更新は不要。


## 固定資材・β確認

- application source `48a2153309ca5ffef4bd88132f0a86a13571ecf1`。正式Web build `9sn6e2_Y8JF_dIJOqij9h`、β build `T90bycRtIRqke2ShzqRsE`。Web／knowledge-opsのbuildに成功。Dockerの許可リストに限定復旧CLIを追加した。
- βへ011のみ適用。既存9件のchecksumを維持してknowledge ledger10、既存revision全体の内容hashを保持。管理ロールを誤って指定した最初のbackupは失敗したため、実際の既存ロールでbackupを取得し直して適用・再開した。本番には未適用。β Webと既存5 Workerが起動している。
- HTTPS βのdataset／公開テーマ一覧／運営入口は200、未認証の制作一覧・運営APIは404を維持。既存β Appから新しい `acceptedKnowledgeUpdates` 契約と黒澤テーマ11版／20 Recordsを読み取り確認。実テーマへの試験書込みは行っていない。
- 別の空ブラウザで390／1280pxのGraph・隣接一覧を確認。横overflowなし、表示通知と鍵の重なりなし、pageerrorなし。iPhone／Safari実機は未確認。
- 固定knowledge-ops image自体で、011前の歴史backupへの読取checkが成功し、移行・復旧済みの隔離DBへの再実行もalready-repairedとなった。immutable内容は未変更。
- 本番配置ガードのPython5件も合格。正しいcandidate opsの利用、隔離復旧で本番設定をmountしないこと、Webb以外／旧版の保全、011だけを既存ledger ownerで適用、checksum差異の事前拒否を確認。合計79件合格。
- 2 imageのOCI archiveは590,193,816 bytes、SHA256 `822b6fa91adc8357e4b26c7fa2d6e2bcac93a76e1871a84dcaeed5a0d35d0d70`。source label／config／manifest／layer diff IDを照合し、本番転送後も全資材hashを確認した。
- 本番適用は `scripts/release-collection-theme-publication-production.py`。現在の正式構成／Webbを切替前とwriter停止後に再照合する。migrationはknowledge011のみ、会員migrationは追加しない。原稿・既存受付・ガイド本文・予定設定を変更しない。旧Web／旧dumpへの機械的な巻戻しは行わない。


## 本番適用前の隔離試験停止と診断待ち

本人実行の配置は、稼働中backupを復元した隔離DBでの限定復旧処理で停止した。Web停止・本番011適用・Webb公開切替の前なので、正式サイトと本番Appを再読取し、公開28／head29と稼働を維持していることを確認した。

最初の隔離実行ラッパーは例外の実メッセージを捨て、root専用ログにも汎用文しか残さなかった。この不足を修正し、復旧の前提条件（状態・版・digest一致・受入状態・有効案件・固定訳文の有無）を内容や資格情報を出さず診断できるようにした。Pythonガード6件と固定ops imageのNode構文検査に合格。

`--diagnose` は既存の今回backupだけを隔離復元し、同じimage／011／復旧条件で実エラーを再現する。稼働中の両DB・Web・Worker・正式設定は変更せず、image再build／予定変更／公開承認の緩和も行わない。診断資材の転送・現地hash照合は完了。`sudo -n` はパスワード要求で拒否されているため、本人実行後に原因を特定する。本番反映・Webb復旧は未完了。


## 見直し中案件による誤拒否の修正

本番隔離診断の結果、復旧に必要な受入・配送主体・operation／result・28／29のcontent digest・固定済み訳文はすべて一致した。拒否したのは見直し工程でworkingの案件が存在したためであり、案件の存在だけを禁止理由にした条件が今回の目的に反していた。

この条件を除き、既存の進捗・実行権・評価・未反映登録を変更せずに証明済みの知識版だけを公開する。対象29より後に未公開の編集版がある場合も、そのheadと原稿を保持する。知識追加版自体が後から見直し完了したケースでは、実際に評価された版までの知識更新の親子関係を個別に照合し、次の資料収集で完了済み案件が再開しないようにした。旧評価を新版の評価済みと表示することはしない。

主要回帰56件（制作／見直し34、知識更新8、配送14）、型検査・Lint・配置ガード6件が合格。進行中見直しの保存済み未反映原稿を維持すること、後続の私的版を一般公開しないこと、見直し済み知識版への次の知識追加で再見直しを要求しないことを追加確認した。修正後の固定build・β再反映・本番再適用はこれから行う。本番データは未変更。


## 修正版の固定資材・再適用待ち

app source `7bd4e5573fd482096bd6ce3b26112f10ff635514`、正式build `8JAqMFTgOxwZF46rOMvp7`、β `5bJDIF63j81B1oYEcI6Lx`。歴史backupへworkingの見直し案件を加え、旧imageで同じ拒否、新imageでcheck→公開29→再実行成功、案件全行不変を確認。βのWeb／既存5 Workerを同じ設定で切り替え、HTTPS・390／1280pxのGraph／隣接一覧・既存App読取を確認した。DB再変更なし。

正式再適用では、検証済みで同一の011について全DBバックアップ・復元を繰り返さず、既存の `collection-theme-20261118T163241Z` を参照して対象メタデータと設定だけを保全する。不要な本番再試行・復元が実行経路にないことを含む配置ガード7件が合格。固定資材は転送・現地hash照合済み。正式Webbは現時点で公開28／head29、本人sudo待ち。遅延原因の調査は実施していない。
