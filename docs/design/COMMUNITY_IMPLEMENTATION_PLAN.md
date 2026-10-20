# コミュニティ：試作の確認方法と段階導入

2026-10-21。[体験](COMMUNITY_EXPERIENCE.md)／[基礎設計](COMMUNITY_FOUNDATION.md)。今回の完成範囲は**設計＋隔離した操作試作**。コミュニティが本番で使える状態になったという報告ではない。

## 確認先

`http://127.0.0.1:3275/`

WSLから起動：

```sh
cd /home/isinxnisi/1.projects/7.graph-knowledge
node prototypes/community/server.mjs
```

Node 24を使用。必要なら既存runtime `/tmp/graph-knowledge-node/bin/node` を指定する。3275はloopback専用。Next.js／3200／betaを使わず、production bundleにも組み込まない。実会員・本番KG・Worker・Kev・DBへの接続はない。

初期ロールはAya（管理者）。上部の試作帯でRen（参加者）、Mio（Capsule所有者）、閲覧者、日英を切り替える。ロールは各場所のmembershipに従うため、Mioも自分のCapsule以外を編集・削除できない。リセット／reloadで架空データへ戻る。変更の永続保存や実ログインは提供しない。

| 一巡したい体験 | 操作 |
| --- | --- |
| 作成→掲載→Graph→戻る | 場所をつくる→公開範囲を選ぶ→Capsuleを掲載→公開版を選択→Graph→元の一覧へ戻る |
| 非公開検討→成果だけ公開 | 自分の場所→物語の下書き室→最近の会話→自分の場所→非公開ノートの「成果の公開版を作る」→公開本文を入力→公開の読書室へ掲載 |
| 所有と掲載の分離 | Ayaで管理→掲載を外す。Mioへ切替→アカウントで元Capsuleが残る。AyaにはMioの削除操作なし |
| 版更新 | Mioで公開用の新版を作る→Ayaで読書室の管理／掲載→新しい公開版へ。過去の会話は旧版を参照 |
| privateな参照を公開投稿へ | Renで読書室の話題へ投稿し、非公開参照の試験欄を選ぶ→閲覧者へ切替。参照の題名・本文は出ない |
| メンバー除外 | Ayaで下書き室の管理／メンバーからRenを除外→Renに切替。会話・共有版を表示しない |
| 場所の公開化 | Ayaで下書き室の管理→公開へ変更→閲覧者へ切替。以前の限定会話・ノート・名簿は表示しない |
| AI取消 | 管理／AI→招待を試す→模擬応答を待機→参加させないを適用→遅い応答を受け取る。取消済みとなり投稿しない |
| 最後の管理者が離れる | Ayaで場所を離れる→アーカイブ。Renは既存の許可範囲で閲覧できるが新規投稿できない |
| Capsule削除と会話の寿命 | Ayaで自分の非公開ノートを削除→下書き室の話題は残り、参照だけ表示不可になる |

private版を他の限定の場所へ渡す操作は、所有者のアカウントから「限定の場所へ共有」。その時点の参加者へ閲覧だけを許可する。招待・管理者追加は、試作では本人承諾済みの状態への遷移を模擬する。実メールや承諾リンクの配送ではない。

## 試作の隔離と限界

- Nodeのstatic serverは4ファイルのGETだけを明示許可。loopback＋Host検査、CSP `connect-src 'none'`／`form-action 'none'`、no-store／no-referrer。環境変数、ソースツリー、APIを配信しない。
- fixtureと状態遷移はブラウザ内。すべて架空で、ソースには閲覧ロールで隠すデータも含まれる。**本物の秘密情報を入れてはいけない。サーバー認可の完成を証明する試作ではない。**
- 実DB競合、失効通知配送、AI通信の取消は未実装。世代比較の純粋モデルで負例を検証する。実接続前には実DB・複数processの試験が別途必要。
- Graphは架空SVGと開閉・戻るの試作。実Explorerの状態管理を改変・複製しない。根拠の実読取、保存View／Workspace／共有URLの機能試作ではない。
- 設定と操作内容はタブのメモリだけ。履歴にはroute IDだけ。スクロールではhistory/state snapshotを書かない。reload後は初期データ。
- 未接続：承認制参加、実招待・通知、投稿審査、サイト運営の通報case UI、共同編集、実AI送信・自動投稿・課金、実分析・貢献台帳。未集計の人気は数値を作らない。

## 次の実装を切る単位

### C1：場と会話、参加・管理の実認可

Community、membership/invitation、限定audience、独立thread/post、監査、アーカイブを会員PGへ追加する。既存会員のsession／active／期待User／Originを再利用。基本管理とアカウントの参加・運営一覧を一緒に実装し、管理を後付けにしない。

依存：schemaレビュー、既存退会／停止へのcleanup統合。最初は個人所有Capsule無変更、AIは設定と未稼働表示のみ。AIIdentityのログインUser代用はしない。

完了条件：2人＋匿名でpublic/private作成、参加・招待承諾、投稿、除外、再参加、最後admin離脱、退会を実DBで確認。privateの名称・数・cursor・通知・遅着応答が漏れない。既存member API、token、旧Capsuleコメントの削除契約が保たれる。移行は追加のみ、既存tableの再解釈なし。

### C2：Capsule版の共有先とギャラリー、Graph往復

既存固定snapshot処理をserviceとして再利用し、public/community-cohort grantとgallery listing/post referenceを追加。公開版のプレビュー→明示公開、固定版掲載→明示更新、公開停止、独立会話の寿命を実装する。実Graphへの参照引継ぎと戻り位置もこの単位。

依存：C1、Capsule所有者サービスのauthorizer抽出。private編集APIをcommunity member全員へ開かない。旧限定linkの同時1件・失効・過去版契約は不変。

完了条件：private検討→成果版のみ公開、公開Capsuleをprivateで会話、private参照をpublicへ貼る負例、共有停止・Capsule削除・退会と同時のread/list/post/Graphを試験。同じ版の取得・掲載・投稿参照を照合。Graph条件・根拠・Undo・保存形式・戻るに回帰なし。C1＋C2が最初の利用価値のある公開候補。

### C3：管理の厚みと運営対応

承認制／申請・招待一覧、対象別投稿審査、限定audienceへの追加共有、通報・限定case access・異議、停止・復帰、管理者不在の回復を導入。本文のない最小auditを整備。必要な期間の保管／削除・復旧時の削除再適用を運用に接続する。

依存：C1/C2。公開運用で必要な基本通報窓口・安全停止は公開前gateであり、C3を丸ごと後回しにして無対応公開しない。高度なqueue画面や異議管理の拡張は段階化できる。

完了条件：community admin／site担当者／本人の操作権が区別できる。停止・削除・異議が監査可能で、private内容を過剰収集しない。アーカイブを永久提供の約束として表示しない。

### C4：AIの招待身元と呼びかけ活動

AIIdentity、operator、participation、scope、processing consent、job、quota reservationを必要な範囲だけ追加する。最初は招待したAIへの明示呼びかけ→確認待ちの結果。実投稿は人間確認後。自主巡回は無効。

依存：C1/C2/C3の認可・取消・case、Kev公開API仕様確認、ユーザーによる実処理先・非公開送信・費用上限の承認。Kev本体の改修が必要なら別途影響・代替案を提示する。

完了条件：権限の減少、owner停止、membership変更、投稿先変更、scope拡大、予算不足、timeout、遅い結果に対して安全に停止／結果不明を区別。送信前・公開直前の再認可と課金予約の冪等性を実provider非課金fixtureで先に確認。未承認private内容を送らない。

### C5：共同管理・貢献・分析・限定的自主活動

共同編集／publish権、community所有Capsule、提出・受入・訂正の由来台帳、human/AI別・scope別分析、介入の選定理由とクールダウンを順次追加する。score一つへ統合しない。共同所有は独立schema版と明示移転承諾が必要。同時共同編集は後段。

完了条件：多重掲載による実績重複なし。private関与を公開件数から推測できない。原版と受入receiptを辿れる。AIの人気偏重・同一対象への反復を検査・調整できる。KGの人間受入経路に迂回なし。

## migrationと既存環境への影響

今回はmigrationファイルも適用もなし。将来のC1/C2は追加migration＋feature flagで導入し、起動時自動migrationはしない。まず専用一時PGで現行001〜004を含むmigration、後方互換、rollbackは機能停止＋table保全を確認する。既存共有tokenやコメントを新コミュニティへbackfillしない。

同一会員Userを使用。新認証基盤・KGのEntity／Claim schema・収集Worker・Global受入・既存Graph保存形式を変更しない。退会・停止のトランザクション拡張だけはC1有効化の前提。DB書込やscope拡張を伴う実導入は今回の承認に含めない。

## 受入試験の分類

| 層 | 初回必須 |
| --- | --- |
| 純粋なpolicy・state | 参照非漏洩、ownership、last admin、archive、版固定、permission generation、重複貢献 |
| API／実PG | 認証・Origin・期待User、LIMIT前認可、idempotency、競合lock、timeout、失効、削除CASCADE境界 |
| UI | JA/EN、PC/狭幅、各role、create/list/Graph/back、private成果公開、管理・AI取消、scroll/history、multi-tab |
| 既存回帰 | 会員保存・共有・コメント、退会・停止、Graph／URL／View／Workspace。既存KG読取はfixtureと代表実データを分ける |
| 公開前 | iPhone実機、実Google/session、失効通知・cache、運営窓口、privacy説明、backup/restore・削除再適用 |

今回の結果と実機未確認は[検証記録](../verification/COMMUNITY_PROTOTYPE_20261021.md)へ記載する。試作policyテストを本番securityテストと読み替えない。
