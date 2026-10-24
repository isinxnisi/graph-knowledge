# コミュニティ第1弾：本番公開記録（2026-10-25）

## 固定成果物と承認

利用者は4c43b17／ad252fdを基準に、Homeのブランド表示修正後の本番公開・005〜008・本人運営者設定を明示承認。閲覧範囲の初期値・順番は変更しない。C2／AIを含めない。

- Webソース：`57ab6055c9d00ba89f1b2505755cb140f99379bf`。4c43b17以後のアプリ差分は共通ブランドCSSと日英privacy説明だけ。ad252fdは記録。
- 本番形式build：`nLR2kDd65nabsE7jj4-EW`。
- Web：`graph-knowledge-web:community-release-20261025-57ab605`、config ID `sha256:8b073b3a5f63b66a836a46f672e1503f99c5d287f518d958cfc3cbf2c6c61bc7`。
- 会員CLI：`graph-knowledge-member-ops:community-release-20261025-57ab605`、config ID `sha256:a0130dfc0fe2c4760d96986053555160f81257fabcc0a270d7844e17064d8ed8`。隔離rehearsalだけ同一imageをgraph-knowledge-ops名でも参照。本番KG opsは変更しない。
- archive SHA256：`9c9e045bed47150776a221d06971028a6e7b81354d77b0b2d794f3df99401427`。VPS転送後の照合成功。
- 画像・archive・manifestの原本：非Git `backups/community-release-20261025/`。公表可能なmanifestは[固定記録](../releases/community-20261025-manifest.json)。config IDと、そのconfigを参照する同梱OCI manifest IDだけを許可する。
- beta build：`GuSW3Aav5eHMX3hqiNZuT`。本番形式imageとはbuild IDが異なるが同じWebソース。3200と外部HTTPSで一致。

## ヘッダーの原因と修正

HomeのExplorer内ではブランドがh1であり、`.explorer h1`のfont-sizeとmarginが、他ページのspanブランドより強く適用されていた。`.header .brand`で共通値の優先を明確にし、行高・余白・ロゴとの整列を統一。ブランドリンクのhover背景は透明にし、フォーカス表示と見出しの意味を維持した。構造や本文の再設計はない。

未ログイン／一般会員／運営者の3ブラウザ試験成功。各々JA390ライト・EN320ダーク・JA1440ライトでHomeとコミュニティのfont-size／line-height／margin／ロゴ整列を比較。16px／19px、横はみ出しなし、hover背景透明。実betaでも本人名・招待・運営バッジを維持したHome→運営画面を確認。iPhone実機は未操作。

## 本番の読取確認（反映前）

管理者本人のsudo読取と、本人がGoogle認証した正式originのprofileを確認。UUIDは保護された配置用ファイルだけに保存し、betaのUUIDや表示名一致で代用しない。最初の読取scriptはstandalone内のneo4j-driverを単独requireできず失敗。Web自身のdataset API・正式Homeの表示件数へ修正して再実行し、以下を取得した。DB変更はない。

- 旧Web：discovery-release-20261020／`N7WjNWiM65EwItM1tux_Y`、healthy。image ID `sha256:d774ea9b2570ff054199459aee465e3b2f4948c97eff7a3cc9e6d80d6f3490a5`。
- 会員DB：graph-member-postgres:5432/graph_member、gk_member、production_member_data volume。000〜004のchecksum一致、schema fingerprint `cb85ca3242ac5f4a6b1704ebe81a5f07e97c1456d36898eb7fa1618d763bc5e0`、1会員／1Capsule。
- origin https://plunode.net、Google、production cookie prefix、広告／公開フラグ1。fixture未設定、コミュニティ／運営flag未設定。
- 公開KG：revision `b74a4b00-9454-412f-af5d-1317713a543c`、2,175 Entity／1,895 Claim。正式URLと稼働Webのloopback API一致。Home集計はlive Neo4j、同梱snapshotをimportしない。
- PG／Neo4jのcontainer ID・StartedAt・mountを取得。既存network・MTU・port・認証・広告をそのまま保つ。

## 今回追加した隔離検証

`test-community-release.ts community-release-20261025-57ab605` 成功。固有Compose project／合成データのみ。テストDB／volumeは終了時に撤去。

- 本番と同じ000〜004のschema fingerprint、既存checksum、個人Capsule／公開版／共有／コメントを保持。
- 005実行後の意図的DDL失敗でledger・DDL一括rollback、checksum不一致の拒否、005〜008の適用・再実行、ledger9件。
- custom dumpを別DBへrestoreし、既存共有・コメント、新規コミュニティ・停止状態の保持。
- 本番形式member-opsのdry-run、限定inspect、非表示／解除、サイト停止／archive復帰、通報終了、復帰承認と本人承諾の分離、停止解除後の旧参加権非復活。
- 同じ本番形式Webで、隔離DBのBetter Auth実セッションを使い、運営APIのinspect／投稿者ID／dismiss／summary／history、一般会員403、匿名401。fixture認証endpointは有効化しない。これはGoogle実callbackの試験とは別。
- Google正式originへのredirect設定、host-only cookie、fixture provider拒否。同じ新buildの両flag停止でAPI404・個人会員機能200・投稿保持。
- Composeの限定patchを、旧flagなし／現flagありの両方で意味比較。Web／member-ops imageと3つのWeb flag受渡し以外は完全一致。KG opsを含む他service・network・volumeを不変にする。
- TypeScript、diff検査成功。既存C1／運営の実DB・画面試験は密度改善記録等を再利用し、無関係なUI評価を繰り返していない。

## beta反映

既存Web launcherのcwd／引数を確認してWebのみ停止、旧buildを非Git backupへ保存し、build後に既存起動方法で3200を再開。既存DB変更なし。local／HTTPSのHome・member・community・PLUTO Graph・operationsが新beta build。未認証運営API401、Google provider、公開JSへ運営者UUIDの非混入を確認。

betaは9 migrations／4会員／2Capsule／3コミュニティ／7投稿を維持。公開KGは従来betaの2,109／1,844のまま。本番へこれらをコピーしない。

## 本番反映の現在状態

管理者本人が固定済みscriptをsudo実行し、公開・migration・両flag有効化を完了。以下の実測と正式URL確認を実施。手順は[導入手順](../runbooks/COMMUNITY_FIRST_RELEASE.md)冒頭を参照。

保持期間・対応時間・毎日監視等の未承認案は確定していない。privacyへは現行仕様・限定確認・監査・公式窓口のみを反映。戻り導線の細部、iPhone実機、C2、AIは後続。認証迂回や本番の合成session投入は行わない。
## 本番反映完了（実測）

|項目|日本時間 2026-10-25|結果|
|---|---|---|
|preflight|04:12:22.265|旧build・接続先・既存checksum・本人UUID・KG一致|
|Web停止完了|04:12:35.559|Webだけ停止|
|直前backup確認|04:12:36.616|custom dump 27,815 bytes、内容一覧確認|
|migration確認|04:12:38.191|000〜008 ledger9件、既存table行digest不変|
|新Web両flag無効確認|04:12:44.839|health・既存機能・KG・新API404|
|両機能の有効化完了|04:12:52.128|COMMUNITY_ENABLED=1／SITE_OPERATIONS_ENABLED=1、本人許可1件|

停止完了から新Webの無効状態検査完了までは約9.3秒、有効化完了までは約16.6秒。これはscriptの実測区間であり、外部HTTPの完全な停止時間を連続計測した値ではない。最後の有効化時にもWebだけ再作成した。

本番WebのImage IDはOCI manifest表現 `sha256:9ce61a97918975e9193b67143f165bb14d22fedef4d393ebc73d284a2fba7fa2`、固定archive内の同じconfigを指す許可値。build `nLR2kDd65nabsE7jj4-EW`。member-opsも固定済みimageを使用し、KG opsのtag／imageは更新しない。PG／Neo4jのID・StartedAt・mount、既存Composeの他の設定、広告・認証環境が不変であることをscriptが検査した。

### バックアップと復旧鍵

- VPS root0700：`/opt/graph-knowledge/backups/community-release-20261024T191235Z`。UTC日付なのでディレクトリは20261024、実施日本日は20261025。
- dump SHA256：`b51074cff4f74d2d9b8c2fbaab5112d2d3f0a3b2dfc24ede1da20b74ae4d0d34`。
- 設定・dump・manifest・runtime metadataを暗号化し、暗号化済みbundleと包まれた鍵だけを管理端末の `~/.local/share/plunode-recovery/community-release-20261025/` へSSH退避。VPS／端末双方のSHA一致。秘密鍵は端末だけの0600、親0700。
- 端末の秘密鍵で実backupをメモリ内復号し、tarの5項目、dump SHAと容量、`pg_restore --list`の既存Capsule／migrationを確認。DBへのrestoreは行っていない。本番個人データをbeta DBへ投入していない。別DBへの実restoreは前述の合成データrehearsalと区別する。
- 標準切り戻しは同一新buildの両flag停止（運営のみの停止も可能）＋Web再作成。追加table・投稿・監査を保持する。DBの復元や旧build復帰は自動実行しない。

## 正式URLでの公開後確認

- `/`、`/en`、`/member`、`/communities`、`/operations`、日英privacy、PLUTO `/explore/...`：200と固定本番build一致。Homeは2,175／1,895、dataset API revision不変、PLUTO名前検索200。
- 本人の通常Googleログインが成立していることを確認。新buildで明示ログアウト→Googleでログイン→本人名／運営入口／既存PLUTO Capsule1件へ復帰。アカウント選択画面を経由せず既存Googleセッションで戻った。Googleアカウント選択UIやiPhone実機の成功とは主張しない。
- 本人の合意済み本番確認用として、メンバー限定「本番公開確認用（運営者本人）」だけを作成し、限定スレッド「正式公開・通報導線の確認」と投稿を保存。Capsule準備中の非活性表示も確認。他の利用者への招待・処置は実行していない。
- 同じ本人の確認専用投稿への「実際の違反申告ではない」通報を送信→運営受信箱へ表示→監査理由付きの明示inspect→対象本文／通報理由／投稿者ID一致→理由付き対応不要→履歴2件（inspect／dismiss）まで実操作。未対応通知は0→1→0。内容を開く前の一覧には私的本文・理由を表示しない。
- 匿名の運営summary／reports／本人profileは401。確認用の限定community／thread APIは404、本文・名称なし。匿名の発見一覧にも確認用限定コミュニティは出ない。一般会員403と失効の網羅試験は隔離本番形式imageで確認し、本番へ別会員を勝手に追加しない。
- PLUTO Graph復元（4Entity／6Claim）→浦沢直樹を展開（13／23）→閉じる（4／6）、アカウントの既存個人Capsuleへ移動し、サイトメニューの元の探索URLから復帰を確認。公開revisionの違うbetaの内容へ置き換わっていない。
- 実画面の保存先：管理端末のCodex visualizations配下 `production-home-20261025.png`／`production-community-operations-20261025.png`。ヘッダー日英・狭幅／PC・ライト／ダークの9画像は非Git `backups/community-release-20261025/header/`。

## 残件・後続

公開は完了。iPhone実機のキーボード・アプリ復帰・下端メニュー、別Googleアカウント選択、別の合意済み会員による本番参加／招待承諾は未実施。これらを隔離検証や本人1名の実操作と混同しない。初回検索遅延の継続評価、戻り導線の細部、未移行Discovery3プリセット、C2、AIは後続。未承認の保存日数・対応保証を新たに公表していない。

本番の既存1会員／1Capsuleは移行前後のdigestと画面で保持。公開確認のため追加したコミュニティ／スレッド／投稿／通報／監査は消さず保存。実際の利用者の内容の改変・削除、公開KG更新、Worker／Kev操作はない。
補足：Graph往復では起点・表示件数・閉じた枝・倍率99%を確認した。選択Entityは復帰時に起点へ戻ったため、選択位置まで完全維持したとは扱わず、細かな復帰体験の後続確認に残す。公開後のDocker private log全文は権限上未取得であり、health・正式HTTP・実画面を検証根拠とする。
