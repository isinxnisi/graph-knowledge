# PC再起動後の稼働確認・復旧

2026-10-20 13:03〜13:17 JST。運営者の指示で既存の起動状態を確認・復旧した。ソース機能・構成・公開KG・受入判断・会員データは変更していない。

## 復旧したもの

- Docker Desktopは起動済み。ローカルの既存 `graph-knowledge-public-neo4j-1` は再起動後に停止していたため `docker start` で同じコンテナとvolumeを起動した。healthy、HTTP 200、既存revision `82b01515-594c-48ca-b4b6-515eefac83ca` を確認。再投入・apply・migrationは行っていない。
- 3200はプロセスがなかったため、既存Node 24と `NEO4J_READ_TIMEOUT_MS=10000 npm run public:start` で、残っていた検証済みbuild `eusXcY7MiIipnZvBtkKVt` を起動した。保持セッションを残す。mainは `7e2d7ea`、Web実行物は正式公開時と同じsource `657f1cf`。文書・収集側の更新を理由とした再buildはしていない。
- Cloudflaredの既存Windowsサービスは自動起動済み。設定変更なしでbetaへの疎通も復旧。3200／betaのHomeとdataset APIが200、同じbuild／revisionを返した。

## 定期処理・変更しなかったもの

- Windows `Plunode-CollectionWorker` は既存の毎分タスクから起動していた。再起動付近のGitHub pushの90秒timeoutがhealthに残っていたが、進行中のWorkerを強制終了せず自然な定期処理を確認し、13:15:33 JSTにhealth=online、WindowsタスクLastTaskResult=0へ回復した。固定コード `973c7b0`・home・trigger・pauseMode=null／control revision 2・実行時間枠を変更していない。承認済み処理以外の依頼投入や、blockedの判断解除もしていない。
- catalog-healthには同日09:00:44 JSTの「Installed code differs from source commit; reviewed worker upgrade required」が残っている。これは設置済み固定コードに対する入力カタログ取込の既存警告で、今回のonline回復をコード更新完了とは扱わない。runtime差替え・再受入・公開applyは行わない。
- `GraphKnowledge-Autopilot` はDisabledを維持。未反映の自動開発commitは0、Git操作途中なし。既存の凍結版Neo4j群は再起動前から数日停止していたため起動しない。
- 会員beta PostgreSQLは自動起動済み・healthy。他プロジェクトのコンテナ・サービスは操作していない。
- 正式サイトはHomeとdataset APIが200、正式build `N7WjNWiM65EwItM1tux_Y`。今回の確認時の公開revisionは `88437056-b74f-42ab-88c0-33ed435bdccc`。ローカルとは別DBであり、前回公開作業時の版へ戻す／同期する操作はしない。VPSの配置・再起動は行っていない。

## 確認と注意点

- 起動直後はNeo4jの起動待ちでdataset API 503、その後Homeの読み取りで10秒timeout／500が発生した。DB healthy後にHomeは3200／betaとも約2秒で200へ回復。初回のbeta UI試験はpattern対象検索のtimeoutで失敗したが、再実行は成功した。単なる起動直後から全操作が成功したとは扱わない。
- betaの名前なしother-works rev2検索は9作品と既存revisionを返した（準備後のローカルAPI観測約0.52秒）。
- 既存Playwrightの `Discovery connected stages ja 1280` をbetaで実行し、再試験1件成功（2.6分）。プリセット絞込み、名前なし対象検索、完全証拠／根拠、Graph条件引継ぎ・自由探索切替・Back、他2タブ、横はみ出し・ページ例外を確認した。新しいアプリコード・試験コードは追加していない。
- 本確認はPCブラウザによる代表操作。iPhone実機や全機能の再受入は行っていない。起動直後のcold遅延は既存の性能評価事項として残す。
- 3200は従来と同じ保持プロセスで、Windowsの新しい自動起動タスクは作っていない。次回PC／WSL停止でWebが止まる点は変わらない。Neo4jのrestart policyも勝手に変更していない。
