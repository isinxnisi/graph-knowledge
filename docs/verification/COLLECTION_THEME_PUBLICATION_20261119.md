# 資料収集と制作・公開状態の分離 検証

## 現在地

①経路監査・②実装・③隔離回帰まで完了。④固定build・β／本番反映・Webb復旧は未完了。

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

Webとknowledge-opsの同source固定build、β migration／代表導線、本番の最新両DBbackup・全体復元／011反復・限定復旧のリハーサル、正式切替・App／公開GET確認が残る。通常ChatGPT Webの予定実行そのもの、iPhone実機の再試験は未確認。MCP操作名・入力／出力schemaは変更せず、get_theme_authoring_guideの説明を整合させたため、接続Appのツール更新は不要。
