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
- **本番は管理者sudo操作待ちで未反映。** 現在はCapsule版 `20e5c84a`／build `vn4RKdqxP0bGkdHIbv3P4`。新手順はこの既知の前提、private設定hash、DB container、KG、Google本人識別を照合してから016/017と公式指定を行う。旧初回deployは再実行しない。

## 検証

- Public profiles PostgreSQL/OIDC統合28件pass。016の既定・旧列保全・再実行、非Google/subject不一致拒否、公式の一般API偽装拒否、予約IDの取得拒否と公式本人の編集、監査・再実行を含む。OIDCはfixtureであり実Googleログイン試験とは区別する。
- avatar/identity/account UIなど30件、空バッジ追加後の対象26件pass。TypeScriptと変更対象ESLint pass。正式public-kgのNode24/Dockerビルド成功。
- `71eb4e0a` の本番Web/member-ops imageを独立Compose/PGで検証。別DB復元・011〜017・公式CLI・Google subject照合・公開/本人画像DTO・Capsule保存/共有URL維持/旧新版コメント/OGP PNG/共有停止・Google callback originがpass。最終5ed458ccとの差分はInvitationBadgeと対応テストのみで、backend/DBは同一。最終資材は再buildしarchive同一性を再照合。
- HTTPS βの実Googleログイン済みセッションで、ヘッダーのGoogle画像が読み込まれ、プロフィール設定でGoogleが選択されていることを実ブラウザ確認。公式の公開ページでGoogle画像・@plunode・公式マークを確認。空バッジ修正後は画像ロード成功、アカウントsummaryの空status要素なしを確認。
- スマホ幅overrideはこの接続の表示幅へ反映されず、実測1920pxだった。iPhone Chromeの実機再確認は未実施。修正は幅に依存せず0件の要素そのものを返さない。

## 本番の管理者操作と復旧

[scripts/release-google-profile-production.py](../../scripts/release-google-profile-production.py) は固定source/build・前提構成を確認し、Web停止、暗号化backup、別DB復元と移行/公式指定のリハーサル、正式originでの明示migration、公式指定、新Web起動、readiness・KG/AI資材/設定保全まで行う。秘密値はprivate stagingのみ。復号秘密鍵は開発PCから転送しない。固定hashでchecksum一覧を照合するlauncherを用意する。

移行前の失敗は元Webを起動する。移行着手後は旧DBで上書きせず、google iconを読めない旧編集UIへの機械的なrollbackも行わない。失敗箇所を確認して修正版へ進める。ユーザーのsudo入力後、正式URLと暗号化控えの確認結果をここへ追記する。
