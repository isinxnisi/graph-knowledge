# localhost:3200の通常Graph DB停止・復帰（2026-11-04）

## 原因と復帰

TOPに `This page couldn’t load` / digest `1234724013` が出た。Webは稼働していたが、通常KG用Neo4j `127.0.0.1:7697` が停止し、TOP500・`/api/dataset`503になっていた。20:21:49 JSTに複数コンテナが終了255で停止し、unless-stopped設定のDB等は自動復帰していた。この通常KGはrestart=noで、停止したままだった。Docker側の再起動と整合するが、再起動させた操作・OS側の原因までは断定しない。対象DBはOOMKilled=false。

既存 `graph-knowledge-film-confirmation-20261028` の名前、loopbackの7697→7687、data volume `graph-film-confirmation-20261028` を照合し、restart policyをunless-stoppedへ変更して同じコンテナを起動した。image・Config・mountsの前後一致を確認。再作成・再投入・migration・dump上書きは行っていない。20:29:30 JSTにNeo4jの起動完了。

変更前の設定・state・volume名は `~/.local/state/plunode-previews/neo4j-recovery-20261104.json`（0600）へ保存。認証・会員DB・新知識DB・AI設定を変更せず、共通Kev・他プロジェクト・別テストDB・tunnelを一括再起動していない。

## 確認

- 復帰前：localhostとHTTPS βのTOP500、通常dataset503。新知識のNorthrop検索APIは200で、通常KG停止との切り分けができた。
- 復帰後：両TOP・localhostのdatasetが200。TOPの2,112対象・1,846関係と紹介テーマを確認。
- 実ブラウザ（IAB）でlocalhostのTOP→PLUTO通常Graphへ進み、4対象・6 Claim／3 Relation、隣接一覧・対象詳細を確認。HTTPS βもTOPを表示。本人Googleの再ログイン・会員操作の再検証ではない。
- Web・capture・readerの既存processは生存。publisherとreviewerは終了していたため、受入済みmainの既存launcher関数から、稼働Webの同じ実効設定・資格で復帰。PID所有確認とlauncherの排他を使い、生存するWorkerは二重起動しなかった。再build・Web再起動なしで復帰した。app `fca14761` / build `6e-oR7REeDvKQEgoaaU1g`を維持。VPSは未変更。
- Cドライブ空き約24GiB。前回のディスク満杯／readonlyの再発ではない。

再発防止は、日常確認用DBの自動復帰設定。意図的な手動stopを維持するunless-stoppedを使用。他サービスに影響するDocker全体再起動の再現試験は行っていない。

[通常Graphの復帰手順](../runbooks/KNOWLEDGE_BETA.md#通常graphのdb停止からの復帰)。記録のみのcommitで再buildしない。
