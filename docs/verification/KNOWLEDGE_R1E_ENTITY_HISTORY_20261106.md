2026-11-06追補：下記の待機はGoogle無料枠の枯渇ではなく、Plunodeの80回／日という設定上限だった。R1fで400回へ見直し、同じ受付を実Gemini1回で自動受理・公開まで確認した。元ID・旧版を保持。[後続結果](KNOWLEDGE_AI_BUDGET_R1F_20261106.md)。

# R1e：対象の原文訂正・固定版読取

2026-11-06 JST。R1の部分実装であり、本運用初版は未完了。設計は[対象原文訂正](../design/KNOWLEDGE_ENTITY_CORRECTION.md)。

## 実装と自動検証

- 共通Entityの名前・別名・説明・原語と理由・根拠を保存し、correct-entityとして会員投稿／取込から共通受理へ流す。
- 元ID・旧版を保持し、1トランザクションでEntityの次版と根拠付き訂正記録を保存。投稿者の帰属を同じdecisionへ保持。
- 投稿結果と公開活動を当時のRecord内容版へ結ぶ。現在版への探索導線を別に置く。
- 履歴から未公開の旧版や、現在停止された対象・資料を表示しない。未有効化のstaged断面を採用しない。

分離したPostgreSQLで外部取込33件、会員投稿・参照57件が成功。UI／ドメイン51件成功・DB接続専用6件skip（対応する実DB検証は上記ハーネスで実施）。計141件成功。変更箇所lintと全体TypeScript型検査成功。会員テストにはdumpの別DB復元と既存migration再実行の不変確認を含む。

会員テストの新規訂正は、実運用と同じ重複候補付きwireでfixture AIの応答を通した。実Geminiによるこの専用訂正方針の新規判定を成功扱いしない。βの同一projectのサービス側設定上限が前段で80/80に達していたため、上限・API key・課金を変えず自動再開を待つ。

## 配置と実操作

appソース 151279031d54b61247ed047249886a4a8514f68f、build EzloeT0Q_uvvVuE-f0Zyx。後続のテストcommit 71f090c1 は実行コード差分なし。main／3200／HTTPS βへ配置済み。正式VPS／3276は未更新。

- 切替前に会員DB・知識DBをdumpし、停止中の全table fingerprintが切替前後で一致。追加migrationなし、会員ledger31／知識001・002・004・005・006・007とchecksumを維持。
- backup：.local/submission-repair/r1e-activation-backup-20261105T154029Z。秘密値やdumpをGitへ含めない。
- Web、確認、公開投影、資料取得、資料読解の5サービスの復帰を確認。private設定11ファイルと既存の取込資格は不変。
- 実操作後も知識のobjects／revisions／journal／旧KG対応／migration、会員・Capsule・コミュニティ等の40保護tableは不変。新しい投稿受付・処理待ちとWorker heartbeat／commandは通常の変更として区別した。
- localhost／127.0.0.1／HTTPS βで固定Record版1/2を200で取得し、no-storeを確認。初回のPython既定User-AgentのHTTPS取得はCloudflare 1010。ブラウザと通常User-Agentでは取得成功し、アプリ障害とは扱わない。

実Googleログイン済みChromeで、通常探索の対象詳細→訂正入口、説明・原語・理由・NASA資料の入力、草稿保存→リロードして再読→明示同意して受付まで確認。PC幅と390px幅（document幅380px）で確認し、横方向のはみ出しはなし。iPhone実機／iOS固有のキーボード挙動は未確認。

[確認投稿（本人用）](https://graph-beta.isinxnisi.com/member/submissions?id=5eb13dbb-0605-409f-82c6-8b05b19d537d) はAriane 5の説明追加。受付版1、state=quota、attempts=0、課金対象request=0、次回利用枠は2026-11-06 17:00 JST。元のEntityと公開知識は変更していない。実Geminiによるこの新訂正方針の判定・自動受理は未確認で、通常Workerが自動で再開する。管理者の承認や再送を待たない。

[当時の内容版1](https://graph-beta.isinxnisi.com/records?id=submission%3Ab68bc162-6a51-4282-8282-54381405332b%3Arecord%3A310d43a1a577fd4d&revision=1) と内容版2の別本文・根拠を確認。旧版画面に「現在は内容版2」を表示し、「現在の知識を探索で開く」で現在版へ切替できる。

再開はmainで既存Node24を指定して python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node。private runtimeを継承し、無料枠・課金・資格を変更しない。

[機械検証の要約](assets/knowledge-r1e-entity-history-20261106.json)／[スマホでの受付状態](assets/knowledge-r1e-entity-correction-mobile.png)。実装15127903・テスト71f090c1は日本語commit・通常push済み。この文書と進行表の更新は後続の記録commitへ残す。最終push／hold解放の結果は完了報告で区別する。

## 残件

R1の翻訳文脈・cache、対象候補の識別、新旧対象と配置別認可、安全境界の不足の照合は残る。今回のUIは共通知識Entityが対象で、旧KGのみの対象を直接変更する機能ではない。R2の登録済み全データ巡回・自動整理、R3の設定後の資料探し・定期収集／配送、R4/R5の検索・年表・多言語・総合一巡は引き続き初版要件。
