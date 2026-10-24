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

成果物の転送・hash一致まで完了。本番Web停止・migration・flag変更はまだ実行していない。管理者sudoがパスワード必須のため、固定済みscriptを本人が実行する部分だけが必要。手順は[導入手順](../runbooks/COMMUNITY_FIRST_RELEASE.md)冒頭を参照。実施後の時刻・結果・本人操作を追記する。

保持期間・対応時間・毎日監視等の未承認案は確定していない。privacyへは現行仕様・限定確認・監査・公式窓口のみを反映。戻り導線の細部、iPhone実機、C2、AIは後続。認証迂回や本番の合成session投入は行わない。