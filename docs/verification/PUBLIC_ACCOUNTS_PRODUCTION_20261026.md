# Issue #39 正式公開の固定資材と確認

2026-10-26 JST。[運営者の正式公開指示](https://github.com/isinxnisi/graph-knowledge/issues/39#issuecomment-6400600301)を対象とする。スマホ実機確認は運営者が完了済み。追加機能・UI変更は行わない。

## 状態

公開資材をVPSへ転送しchecksumを照合済み。現時点では実sudo操作の引継ぎ待ちで、本番会員DBの009／010適用・Web切替はまだ実行していない。正式公開完了の記録ではない。

## 固定した対象

- 受入済み機能はmain `82dae18`。公式AIの既存PNG 2点とAI停止CLIを本番imageへ同梱する配置修正だけを追加したアプリSHAは `767020c1af11cb8919cca8cdb4866efb1956284f`。
- Web build `p2mPLpwWtvRzE54EdYqwS`。image/archiveの固定値は[manifest](../releases/public-accounts-20261026-manifest.json)。archive SHA256 `4ce89d5530a4dfbd932376f34ee3a74a875cf7517a4e1ec58154263b0f6688b1`。
- 公開スクリプトSHA256 `3750561b970c2894a09d399b376de8f58053669e1492fd79143828abb5ddaf02`。`/home/develop/graph-accounts-release-20261026/` の全5資材を転送先でも照合済み。
- 旧本番は前回公開記録のbuild `nLR2kDd65nabsE7jj4-EW`、ledger000〜008を前提とし、root preflightで異なれば停止する。公開HTTPからKG revision `b74a4b00-9454-412f-af5d-1317713a543c` を確認。正式Google会員の現UIで既存「PLUTO」Capsule 1件を確認した。

## 隔離検証

本番用linux/amd64 Web/member-ops imageを実buildし、型検査を完了。本番と同じスクリプトを固有Compose project・PG・Neo4j・合成会員で一括実行した。OSのroot要件と対象定数だけを試験内で差し替え、実際のOS昇格や本番接続は行わない。通常のsudo要件を変更していない。

- 旧24テーブルをcustom dumpし、実際の別DBへrestore。列、全行数/hash、000〜008 ledgerが一致。
- 実CLIで009／010適用後11件。旧列はUser.nameの意図した整合以外一致、既存Capsuleを保持。欠落プロフィール0、AIの固定ID 2件、migration再実行は全行無変更。
- 有効な旧名の保持、メール型旧名のランダム仮名化、自動プロフィール・新規生成タイムライン初期公開を確認。
- 匿名プロフィール・AIの活動0件、内部User ID/メールの非公開、会員・フォロー・招待の匿名401、Google callbackの正式origin、全アバターPNGの200を確認。
- 新Webへ切替後の一時停止でprofile/AI APIは404。11件のmigrationと保存データを保持。
- 暗号化控えを実復号し、復元用dumpの同梱を確認。Composeの既存設定・KG ops imageを意味単位で保持。
- 既存コミュニティ公開scriptの設定引継ぎ回帰も成功。既存116件の実PG/OIDC・856件の単体結果は[main/beta受入記録](PUBLIC_ACCOUNTS_BETA_ACCEPTANCE_20261026.md)を参照。

## 保全と次の操作

共通Autopilot holdを取得し、reviewは未受入0件。既存AI育成worktree `af31afd`、AI公開worktree `02bf1c5` とその他worktreeの変更を取り込んでいない。mainの未追跡 `memo.txt` を保全。KG/Kev/既存AI artifact・実験記録は変更しない。

管理者端末で[固定runbook](../runbooks/PUBLIC_ACCOUNTS_RELEASE.md#2026-10-26-正式公開用の固定手順)を実行後、暗号化控えをローカルへ回収・照合し、正式サイトのGoogle再ログイン、既存Capsule、プロフィール、活動、フォロー、招待、コミュニティ、運営、Graph、AIラボを確認する。切替未実施の間は従来の正式サイトと既存betaを維持する。
