# 運営画面の情報密度・対応待ち通知

2026-10-25。基準main 6a5016c（Web e974cb7）から実装。**Web候補4c43b1796b3cd8a2c3f21b1ba8d43ac71886ad71 / beta build `QYCiGHONsgFhzp5KqgFEp`**。記録だけの後続commitとWeb buildを区別する。本番反映は未実施・別承認。

## 実装と判断

- スマホでも短い属性・状態・分類・受付/確認期限を2列にまとめる。案件/対象/場所/申請者/実行者の完全IDは任意展開＋コピー。一覧は短い案件番号と短い日時、本文は14pxを維持する。ダイアログだけ文字を極小化する方法にはしない。受信箱概要は一覧で表示し、案件詳細では省略。IDを消すのではなく、確認に必要な情報と補助情報を分ける。
- 共通ヘッダーの運営者入口を盾アイコン＋対応待ちバッジとし、アカウントメニューにも同じ集計を表示。PC/スマホともメニューを開く前から気付ける。更新中に入口や入力を再生成しない。
- 認可付き `GET /api/site-operations/summary` を追加。open通報＋現在判断できるpending復帰申請をDBで集計し、先頭ページ件数から推測しない。期限切れ通報は終了/対応不要の判断が残るため未対応に含め、確認期限終了として内訳表示。期限切れ・無効な復帰申請、承認後の本人承諾待ちは含めない。24時間以内の通報確認期限と次の期限も表示する。本文・理由・対象/投稿者/通報者IDは返さない。
- 共有認証providerの30秒確認と画面復帰を利用。共有storeで重複を抑え、25秒内の新しい結果は再利用。明示更新・処置後は再取得。未取得は「…」、失敗は「!」であり0件ではない。処置前の遅着応答は新しい結果を上書きしない。別User/失効/ログアウトでは破棄。永続保存・メール等の新しい配送基盤はない。
- 利用者の追加指示により、許可された投稿inspect結果にだけ `authorAccountId` を追加。投稿者IDのコピーとアカウント状態確認へ進める。通報者とは区別し、表示名・メール・名簿・別投稿は増やさない。期限/権限/版/hashの検査で内容が返せない場合はIDもnull。queue・通知・receiptには複製しない。既存の「作者情報は返さない」契約/試験は、この限定したIDの例外へ更新し、通報者IDを返さない検査を維持する。
- スレッド作成の「誰でも」を初期値・先頭にする指示は撤回されたため、作成UIの初期値・順番・audience意味は変更しない。
- DB schema・migration・権限モデル・会員停止/再開の意味は変更しない。C2/AI・本番・KG・Worker・Kev・3275試作は対象外。

## 重点検証

| 区分 | 最終結果 |
|---|---|
| 運営API＋実OIDC/隔離PG | 14件合格。集計の認可、ページ非依存、期限間近/期限切れ、終了後減算、申請者停止/期限切れ/却下、非運営者拒否、作者IDの限定取得・失効・receipt非保存、既存再送/競合 |
| 既存C3安全管理＋実PG | 14件合格。通報対象限定、通報者ID非公開、期限/世代/停止/撤回、濫用制限、遅着/競合、終了と非表示の分離 |
| 既存会員/Capsule＋実PG | 33件合格。実OIDC・限定共有・版別コメント・停止/退会・再開時の旧権限非復活 |
| 重点単体/UI/Graph保存 | 100件合格。認証store7、通報UI3、共通部品5、会員UI13、Graph経路7、Workspace65。入力・再認可・別User・遅着・件数失敗・一本化も確認 |
| 実認証ブラウザ | 8シナリオすべて合格。通報確認/取消/結果不明再送/履歴、アカウント停止/再開、復帰判断、遅延認証/運営権限拒否、新着と終了による件数更新/取得失敗/入力保持、作者ID→アカウント状態、20件超のページング・ID展開/コピー |
| 型/関連lint/build | tsc --noEmit、変更TS/TSXのeslint、public-kg最適化buildの型検査とも成功 |

ブラウザは隔離DB・検証用OIDCを使用。0件/少数/20件超、JA/EN、320/390/430/1440px、ライト/ダークの代表条件を確認。自動更新試験はページ読込前からブラウザ時計を制御し、別の検証Userが送った実API通報の到着を全体reloadなしで確認した。初回の試験定義にはボタン名/重複selector、時計の設置時点、多数fixture作成時のコミュニティ上限の問題があり、修正して最終8件を通して再実行。上限をアプリで緩めず、同一fixtureスレッドの複数投稿を用いた。

## 同条件の画像比較

すべて**隔離データの実画面**。実betaの私的な案件や本人IDはGit画像へ含めない。変更前はe974cb7、変更後は4c43b17の実装。異なる隔離DBのためID/日時そのものは異なるが、幅・言語・テーマと画面用途を揃える。

| 画面 | 変更前 | 変更後 |
|---|---|---|
| JA 390px 通報詳細 | [画像](assets/operations-density-20261025/before/detail-ja-390.png) | [画像](assets/operations-density-20261025/after/detail-ja-390.png) |
| JA 390px 確認ダイアログ | [画像](assets/operations-density-20261025/before/confirm-ja-390.png) | [画像](assets/operations-density-20261025/after/confirm-ja-390.png) |
| JA 390px 受信箱 | [画像](assets/operations-density-20261025/before/inbox-ja-390.png) | [画像](assets/operations-density-20261025/after/inbox-ja-390.png) |
| JA 390px 履歴 | [画像](assets/operations-density-20261025/before/history-ja-390.png) | [画像](assets/operations-density-20261025/after/history-ja-390.png) |
| EN PC アカウント | [画像](assets/operations-density-20261025/before/account-en-1440.png) | [画像](assets/operations-density-20261025/after/account-en-1440.png) |

詳細のfullPage画像は390×1210から390×844（確認viewport高）へ収まり、主要処置を初期viewport内で見渡せる。確認ダイアログは重複する完全UUID行を省き、対象→影響説明→理由→確定/取消のまとまりを短くした。本文・入力・操作ラベルの可読性は維持。[320px多数案件](assets/operations-density-20261025/after/many-ja-320.png)、[ENダーク390px](assets/operations-density-20261025/after/detail-en-390.png)、[投稿者確認](assets/operations-density-20261025/after/inspect-ja-390.png)、[0件](assets/operations-density-20261025/after/empty-ja-390.png)も目視確認。

## 反映と実beta

- [ローカル3200](http://127.0.0.1:3200/operations)と[実beta](https://graph-beta.isinxnisi.com/operations)で上記buildを確認。Home/member/communities/PLUTO GraphはすべてHTTP200かつ同build。Google認証継続、許可本人UUIDが公開static JSに含まれないことも検査。匿名summaryと受信箱APIは401・private/no-store。
- 既存のログイン済み本人セッションで、初回確認中→本人表示、ヘッダーの件数、受信箱の内訳、案件メタデータ、確認ダイアログを開いて取消、アカウントへの移動とヘッダーからの運営受信箱復帰を確認。既知本人がゲスト表示へ戻らないことも確認した。
- **実betaでは内容確認の確定、投稿/申請/アカウントへの処置・試験通報送信をしていない**。新着/終了の書込み試験は隔離DBで実施。実betaにある既存データをfixtureで置換せず、DB migrationは0、機能flag・運営者許可・認証設定も変更なし。beta ledgerは000〜008を継続。
- 直前build `n03NltyZRtAmF5flU2X8G` は `backups/operations-density-beta-prebuild-20261025/.next-public` へ退避。異常時はWebを止め、新buildを保管してから退避版を戻し、既存start-local-previews.pyでWebだけ起動する。両版とも008と互換。DBを戻したりtableを削除したりしない。機能停止・許可解除は[既存運用](../runbooks/SITE_OPERATIONS.md)を維持する。
- 正式サイトは旧build `N7WjNWiM65EwItM1tux_Y` のまま応答。VPS/本番DB/KG/Worker/Kevに変更なし。

## 残件・公開候補

本番用image/manifestの固定、正式originでの認証/運営者指定・直前backup等は、前工程の[公開準備](COMMUNITY_RELEASE_READINESS_20261024.md)・[導入手順](../runbooks/COMMUNITY_FIRST_RELEASE.md)に従って別承認。新候補は既存運営Web e974cb7に、今回の密度・集計通知・限定作者IDを追加した4c43b17。前のimageをこの版として流用しない。今回新しいmigrationはないが、正式環境には既存005〜008の適用判断が引き続き必要。

iPhone実機・ソフトウェアキーボード・OS復帰は未確認であり、狭幅Chromiumと区別する。ページ再読込を跨ぐ処置草稿の復元、保存期間job、メール/プッシュ、AI/C2、運用担当・期限保証の未承認事項は追加していない。ここで停止し、beta評価と本番公開前準備へ戻る。