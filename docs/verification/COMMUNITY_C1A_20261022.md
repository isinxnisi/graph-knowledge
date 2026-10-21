# コミュニティ C1a実基盤・UI調整（2026-10-22）

## 採用した範囲

第1弾は人間のコミュニティ。C1をC1a（公開参加・独立会話・基本管理）とC1b（招待・再受入・継続運営）に分けた。C2掲載と最低限のC3安全管理までが公開条件。AI設定・活動分析は第2弾へ移し、試作の管理メニューから除いた。既存の将来モデルは削除していない。

## UI

3275は既存Home／Explorer／会員画面の接続試作を継続。ホームの個性を残し、Capsule一覧・会話・管理の見出し、行高、余白を用途別に縮めた。文字の一律scaleは使わない。ヘッダーとコミュニティ内タブを追随させ、重複した戻りを整理し「アカウントへ戻る」「探索へ戻る」と戻り先を明示した。

実C1は `CommunityPage` と通常route/APIで実装し、試作iframeから独立。入力は直接選択、PCは情報左・操作右、スマホは折返し。履歴へ本文・名簿・検索cacheを保存しない。権限再取得、非表示時の破棄、Abort／世代照合で遅着応答を防ぐ。定期再認可では入力欄・スクロールをリセットしない。

## 実装

- `db/member/005-communities.sql`：場、membership世代、固定audience、独立thread/post、冪等receipt、最小監査。
- `lib/server/member/community.ts`：既存session／active／Origin／期待Userによる認可、トランザクション、revision競合。作成・投稿はUUID冪等キー、再試行でも再認可。
- `/api/communities/[[...path]]`：機能flagがない場合404。匿名は公開情報のみ。名簿は管理者のみ、限定会話は固定参加世代で判定してLIMIT前に絞る。
- 停止・退会時は既存会員処理から失効。退会投稿は撤回、他人の返信・独立会話は保持。既存Capsuleのcascadeや共有tokenを変更しない。
- Graph／View／Workspace保存形式変更なし。C1画面からのCapsule掲載は未接続。ヘッダー・アカウントの入口もflagで制御。

## 検証

隔離PG（55432）とローカル署名OIDC（3222）、実Better Authを使用。fixtureは本番用Google認証ではない。テスト終了時に専用DB・providerを終了し、既存会員DBにmigrationやテストUserを投入しない。

```sh
PATH=/tmp/graph-knowledge-node/bin:/usr/bin:/bin:/usr/local/bin node --import tsx scripts/test-member.ts --community
PATH=/tmp/graph-knowledge-node/bin:/usr/bin:/bin:/usr/local/bin node --import tsx scripts/test-member.ts
LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu node --import tsx scripts/test-member.ts --community --e2e
```

- C1実PG／実認証10件成功：cohort、再参加、公開往復、管理者承諾、最終admin、除外、期待User／Origin、冪等性、停止／退会、ロック待ち投稿の取消、flag無効。
- 既存会員33件成功：別の新規隔離DBで実施。旧schemaでも会員・Capsule・共有・コメント・停止・退会を維持。
- 実C1画面：日本語1440px／英語390pxで作成→投稿→管理→archive/reopen→戻り→退出後閲覧拒否。iPhone実機ではない。
- 接続試作：日英×1440/390pxでA（トップ→掲載→Graph→一覧）、B（Graph→account→管理→元Graph）、C（自分Capsule→掲載先→元Capsule）を確認。browser Back/Forward、ノード／辺／配置／pan／zoom復元、直接URL、権限ロール喪失、会員/auth API隔離を確認。
- ルート型検査、関連lint、生成接続版Next webpack buildを確認。

## 未完了・公開前条件

C1bの招待／再受入／管理者不在回復、ページング、C2実掲載、通報・hide・コミュニティ停止運用は未実装。一覧50、thread/member/post等は有限上限で部分表示を示す。上限を全件と誤認させず、次工程でcursorを追加する。限定作成は作成者のみとUIに明記。作成回数の濫用制限、実Google、iPhone実機、backup/restoreは公開前確認。

3275／graph-comは架空データのまま。実C1は隔離テストで検証した機能flag付き基盤であり、graph-comの模擬操作を実DB接続済みと報告しない。3200／betaで有効化しない。本番・公開KG・既存会員DB・収集Worker・Kev・AI送信・課金は変更しない。

所要時間は実装・重点テスト・画面確認・buildに分けてログを保持。テスト初回の共有fixture干渉はC1と旧会員suiteを別DB実行へ分離、E2Eのalert多重一致はlocatorをmainに限定して修正。これらの再試行を成功件数へ重複計上しない。

画面記録：[PC Capsule一覧](assets/community-c1a/ja-1440-capsules.png)、[スマホ管理](assets/community-c1a/ja-390-management.png)、[英語スマホホーム](assets/community-c1a/en-390-community-home.png)。外部graph-comでも同じ日英・幅別の往復試験が成功した。

## 最終反映

3200 build `ppnxF-XaySAr2aTJsVy-x`、コミュニティflag無効。3200とgraph-betaでHome／PLUTO Graph表示、`/communities` と新APIの404を確認。3275とgraph-comもHTTP200、JS/CSSと日英切替・往復試験成功。4環境の読取revisionは `82b01515-594c-48ca-b4b6-515eefac83ca` のまま。既存Host検査を維持、無効Hostは404。

[実C1・英語スマホ会話](assets/community-c1a/c1-en-390-conversation.png)／[実C1・日本語管理](assets/community-c1a/c1-ja-1440-management.png)。実C1は一時テスト環境で撮影し、終了後にDBを破棄。3275の架空データ画面と区別する。最後のE2Eは投稿本文をarticle内で確認し、入力欄の文字を成功と誤認しないassertにした。2件1.9分で成功。

検証コスト：C1実PG約3秒、既存会員約10秒（各DB起動は別）、実C1の代表E2E約2分、接続試作の4組往復は数分。public buildはcompile38秒・型検査50秒＋trace。重い全面回帰は行わず、接続・認可・失効の重点試験を実施。実装とUI整理は複数の作業区間に分かれているため、正確な合計所要時間は未集計。
