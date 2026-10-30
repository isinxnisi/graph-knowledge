# Google画像と公式プロフィールの反映（2026-10-30）

## 依頼と実装

人間の公開アイコン既定をGoogle画像へ変更し、既存ユーザーも016で一度だけ変更する。画像なし・不正URL・読込失敗は人型へfallback。本人が固定アイコンへ選び直した場合は公開DTOへGoogle画像を出さない。共通ヘッダー・公開プロフィール・フォロー・コミュニティで同じ画像を表示する。メールやGoogle subjectは公開しない。

追加依頼の本番公開ID `member-f40013def65449bc` は `@plunode`／「Plunode公式」への変更対象。βでは指定Googleアカウントに対応する旧公開IDを確認済み。017の公式属性とoperator操作を追加し、Google subjectの一致を本番の切替前にも要求する。自己紹介・会員ID・投稿・Capsule・フォローを保持し、公式指定による管理権限の追加はない。既存公式AIは別アカウントのまま。

画像右上の白丸は、招待0件の空バッジだった。0件はDOMから除外し、確認中・取得失敗・1件以上の表示は維持する。

## 資材と確認済み状態

- アプリ固定SHA `5ed458ccbf58aea35dae5644209f79683e387dcf`。画像既定 `5a22056b`、公式指定 `71eb4e0a`、空バッジ修正 `5ed458cc`。
- localhost:3200／HTTPS β: build `PYE1pAPFvsuJnYfbgtara`。両originで同buildと確認KG revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb` を確認。
- β: 000〜017の18件・全checksum一致。4人全員Google選択、公式1人、公式監査1件。公開URL https://graph-beta.isinxnisi.com/people/plunode 。既存Google/private設定と実サービス10containerを保持。
- βの016・017はそれぞれ停止中のprivate backup→別DB復元→移行→再実行→対象を限定した行比較を実施。公式指定も復元DBとβ実DBで、対象profile・同期user名/更新時刻・handle予約・監査以外の変更なし、再実行無変更を確認。旧migrationのchecksumは変更していない。
- 017反映後の広すぎるcontainer監視が、並行して終了した隔離テストcontainerも検知して終端で停止した。DB操作・新Web起動・両URL照合はその前に完了。最後のWebのみの更新では隔離テストを監視対象から除き、実サービス10container・private設定の保持まで完了した。
- 本番用build `2ot-o4qNUifoDe2J2Pk_s`、image tag `google-official-5ed458cc`。[資材manifest](../releases/google-profile-20261030-manifest.json)。config IDとOCI manifest IDの両方をarchiveの実bytesから照合する。
- **本番反映完了。** `20e5c84a`／build `vn4RKdqxP0bGkdHIbv3P4` から、上記5ed458cc／build `2ot-o4qNUifoDe2J2Pk_s` へ切替。既知の前提、private設定hash、DB container、KG、Google本人識別を照合してから016/017と公式指定を実施。旧初回deployは再実行していない。

## 検証

- Public profiles PostgreSQL/OIDC統合28件pass。016の既定・旧列保全・再実行、非Google/subject不一致拒否、公式の一般API偽装拒否、予約IDの取得拒否と公式本人の編集、監査・再実行を含む。OIDCはfixtureであり実Googleログイン試験とは区別する。
- avatar/identity/account UIなど30件、空バッジ追加後の対象26件pass。TypeScriptと変更対象ESLint pass。正式public-kgのNode24/Dockerビルド成功。
- `71eb4e0a` の本番Web/member-ops imageを独立Compose/PGで検証。別DB復元・011〜017・公式CLI・Google subject照合・公開/本人画像DTO・Capsule保存/共有URL維持/旧新版コメント/OGP PNG/共有停止・Google callback originがpass。最終5ed458ccとの差分はInvitationBadgeと対応テストのみで、backend/DBは同一。最終資材は再buildしarchive同一性を再照合。
- HTTPS βの実Googleログイン済みセッションで、ヘッダーのGoogle画像が読み込まれ、プロフィール設定でGoogleが選択されていることを実ブラウザ確認。公式の公開ページでGoogle画像・@plunode・公式マークを確認。空バッジ修正後は画像ロード成功、アカウントsummaryの空status要素なしを確認。
- スマホ幅overrideはこの接続の表示幅へ反映されず、実測1920pxだった。iPhone Chromeの実機再確認は未実施。修正は幅に依存せず0件の要素そのものを返さない。

## 本番の管理者操作と復旧

[scripts/release-google-profile-production.py](../../scripts/release-google-profile-production.py) は固定source/build・前提構成を確認し、Web停止、暗号化backup、別DB復元と移行/公式指定のリハーサル、正式originでの明示migration、公式指定、新Web起動、readiness・KG/AI資材/設定保全まで行う。秘密値はprivate stagingのみ。復号秘密鍵は開発PCから転送しない。固定hashでchecksum一覧を照合するlauncherを用意する。

移行前の失敗は元Webを起動する。移行着手後は旧DBで上書きせず、google iconを読めない旧編集UIへの機械的なrollbackも行わない。失敗箇所を確認して修正版へ進める。


## 本番結果（2026-10-30 21時台 JST）

ユーザーが既存sudoへ入力し、固定資材のchecksum照合→前提確認→backup/別DB復元→016/017→公式指定→Web切替を完了した。正式URLは https://plunode.net/people/plunode 。本番2人のhumanプロフィールをGoogle選択へ変更し、指定した1人だけ `@plunode`／「Plunode公式」へ指定。βのGoogle subject hashとの一致も確認した。監査を残し、再実行で追加変更がない。管理権限は増やしていない。

- migration ledger: 000〜017、18件。既存000〜015のchecksum不変。別DB復元の33 tableを照合し、016のhuman icon/revisionと017の公式属性以外の旧行を維持。公式指定は対象profile、名前同期user、handle claim、監査だけに限定し、他の行を保持。
- backup: `/opt/graph-knowledge/backups/google-profile-release-20261030T121930Z`。dump SHA256 `06a585609afd7649570ab420390cead03a3ad560e328fc63ed6ef23244eb2793`。暗号化控えを開発PCへ取得し、ローカル秘密鍵で復号してdump/hash・復元記録・移行前ledgerを確認。検証用の復号一時ファイルは削除済み。秘密鍵はVPSへ転送していない。
- Web OCI manifest: `sha256:8eb1703208fe5451ea517ccdd66a134f97cb5955152fd9c46343ed86336a1917`。
- member-ops OCI manifest: `sha256:72b269d11c0f946f99f36422edb574a79d7a5113357b3968fcb81ba92c492010`。
- private設定、Google認証設定、会員PG/Neo4j実行container、KG revision、既存AIラボartifactの保持を確認。KG/Worker/Connectorは変更なし。
- localhost3200／HTTPS βは `PYE1pAPFvsuJnYfbgtara`、正式URLは `2ot-o4qNUifoDe2J2Pk_s`。3originのHTML build、KG revision、公開プロフィールAPIのGoogle画像・公式属性を確認。
- 正式サイトの実Googleログイン済み公式本人セッションで、公開ページのGoogle画像・@plunode・公式マーク・既存自己紹介、本人設定のGoogle選択・公開ID・表示名を実ブラウザ確認。画像はロード成功、ヘッダーに空の招待statusはない。新たなGoogle認証リダイレクトや再ログインは行っていない。
- 自己紹介は切替直後のDB全行比較で保持。後続公開APIでは空行が1つ少なかったが文章は一致した。反映後の編集かどうかは未確認であり、ユーザーの内容を上書きして戻す操作はしていない。移行で消えたものとして扱わない。
- 最終照合scriptの最初のHTTP取得はurllibのproxy経由でlocalhostが403となった。localhostをproxy対象外にしたcurlで3originの実サービスを確認した。サービス障害やDB移行失敗ではない。

変更実装commitは `5a22056b`、`71eb4e0a`、`5ed458cc`、資材/手順の記録は `4d56ace0`。いずれも通常push済み。最終結果も日本語commitで記録し通常pushする。未関連の `memo.txt` を保持し、Autopilot候補の一括受入/確認済み操作は行っていない。
