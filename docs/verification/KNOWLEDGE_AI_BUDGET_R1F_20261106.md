# AI上限見直しとR1継続

2026-11-06。ユーザーの見直し指示による変更。R1全体や初版全体の完了ではない。

## 変更

[上限の契約](../design/KNOWLEDGE_AI_BUDGET.md)に従い、Googleの確認済みRPD500に対してサービス上限400回／日へ変更する。収集133、翻訳66、開発評価100を内数として制限。RPM12／入力TPM200,000、日次入出力各2M／月次各62Mも調整する。

サービス設定上限とGoogle側の制限を表示文言でも分ける。過去の「無料枠による待機」は、実際には80回のサービス側設定上限だった。

## 検証

実GoogleのAI Studio、plunodeプロジェクトの無料枠でRPM15／TPM250K／RPD500を再確認。7日間の最大使用量表示を当日の残量と取り違えない。

分離PostgreSQLの取込・予算35件、収集11件、会員投稿57件の計103件が成功。lint／型検査／production build成功。追加migrationなし。


## 反映と実測

app source c9e5512119c9930db6b49d6b74bf407371e09222、build Q8tWL8ZC-xDKMN_5bTqHO をmain／3200／HTTPS βへ反映。旧build EzloeT0Q_uvvVuE-f0Zyxから更新した。DB dumpを保存し、停止中の全行fingerprintを照合してから設定を変更。設定digestとサービス上限待ちの予定時刻だけを更新し、全ての既存AI試行・usage、provider pause／Retry-Afterを維持した。private設定はbudgetのみ変更し、認証・KG・API key・送信資格は不変。5サービスを復帰した。

backup：.local/submission-repair/quota-activation-backup-20261105T162227Z。追加migrationなし、会員ledger31と知識001/002/004/005/006/007は不変。秘密値・dumpはcommitしない。正式VPS・3276・共有Kevは未更新。

旧設定上限で待機していた[本人の同じ受付](https://graph-beta.isinxnisi.com/member/submissions?id=5eb13dbb-0605-409f-82c6-8b05b19d537d)を新規受付に作り直さず再開。Gemini 3.1への送信1回、入力651／出力187 tokenで原資料照合・自動受理・公開へ到達した。Ariane 5の同じEntity IDが内容版2となり、説明と日本語の原語指定を反映。元の内容版1と既存Record固定版の対象参照はそのまま保持した。

実GoogleセッションのHTTPS βで「公開しました」、公開当時の固定版reader、投稿者isinxnisiの楕円Badgeを確認した。個別の管理者承認は行っていない。[公開した訂正記録](https://graph-beta.isinxnisi.com/records?id=submission%3Ab3875679-c1fa-46f1-8765-e02a43f0e58b%3Arecord%3Af5ad26ed2e311d25&revision=1)／[機械検証要約](assets/knowledge-ai-budget-r1f-20261106.json)／[公開完了の画面](assets/knowledge-ai-budget-r1f-published.png)。

## R1の残り

今回閉じたのは、上限の過剰な制限とR1e訂正の実AI正常例。新たな大規模AI評価は追加していない。専用訂正方針の広い異常系は未評価。翻訳文脈とcache、対象識別、新旧接続と配置別認可、安全境界の照合は残る。全データ巡回・自動整理・設定後の資料探し／定期収集・配送も初版要件のまま。

上限変更の前段では、設定以外の確認・文言・評価用配分まで広げ、ユーザーの「サクッと」に対して時間を使いすぎた。今後の上限調整では既存手順を再利用し、設定値・schema上限・旧待機の再開をまとめて扱う。必要な保全と品質確認を省く意味にはしない。
