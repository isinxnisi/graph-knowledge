# Capsuleの閲覧・共有・コミュニティ導線の仕上げ

Issue #63 / 2026-10-30。ユーザーのdraw.io注記と、会話一覧への戻り・モーダルの表示時位置ずれを対応対象とする。

## 実装と検証の区別

2026-10-31、本番反映と正式URLでの代表操作確認まで完了。最新の配置・確認範囲は末尾「本番反映完了」を参照する。以下の未完了・未配置の記述は各工程時点の履歴であり、機能テスト・実Google操作・未確認事項を区別して残す。

- アカウント一覧と内容タブを分離し、編集時だけ広い作業面へ入る。旧形式も共通Graphで読む。
- 一覧・My Capsulesにごみ箱・復元を追加。新規利用枠20件、既存超過分の閲覧・編集を維持。
- 共有Graph・コミュニティCapsule・Capsuleコメントへ公開プロフィールを表示。コメントの人物表示は枠なし、投稿時の図は末尾。
- コミュニティ一覧の図示アイコン・作者表示、会話一覧への戻り、掲載確認の幅・説明・操作を整理。
- 中央配置transformに干渉していた共通dialogアニメーションを独立したtranslateへ修正。表示領域の計測を初回描画前に行う。

## 現時点の検証

- 対象UI・会員クライアント等8ファイル81項目成功。旧編集フォーム専用の親コンポーネントテストは共通Workspaceの導線テストへ更新。Workspaceの別本人・遅延保存・結果不明再送・草稿保持の既存テストは継続する。
- 隔離PostgreSQLでCapsule統合17項目成功。018の再実行、既存snapshot保持、ごみ箱・復元・再送・別人拒否・共有停止・掲載停止・独立会話保持・20件の境界・既存超過分の編集・公開作者と非表示投稿の匿名化を確認。
- 会員の実OIDC・別dataset・認可・競合・退会・DB復旧の統合36項目成功。削除の期待値はごみ箱のsnapshot保持へ更新し、ケース間の保存枠の干渉を避けて専用fixture DBを分離する。
- 型検査と変更対象lint成功（未使用importの警告2件は除去）。
- 最初のUIテスト起動は除外指定漏れでprivate backup下の旧ソースも探索したため中止。backup/.localを除外して対象だけ再実行した。容量試験の初回SQL timeoutはその重複負荷中の結果であり、隔離再実行は成功。

## 今後の記録

固定SHA/build、018のbackup・別DB復元、3200/HTTPS β/正式サイトの反映、PC/スマホ幅の実画面・操作評価、未確認事項をここへ追記する。memo.txtと並行サービスを保護する。

## 2026-10-31 β反映と追加フィードバック

- アプリ配置SHA: `fd9f39a38ce36b6b45e979f1c69a2b0d34665a46`。
- 3200/HTTPS β build: `ixvpDiv_71G8FLjgLRv1v`。両URLのHTML buildとKG revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`を確認。既存launcher/private runtime/Google認証を保持。
- 018を適用しledgerは19件（000〜018）。000〜017のchecksum保持。別DBへの復元、移行・再実行、既存34テーブルの全旧列の行hash一致、既存Capsuleのtrashed_at全NULLを確認。移行直前backup SHA256: `ebb8d09f3abc5205f95d74836ed7f3fb4abd08e01678ee52d644b251dc376433`。private記録は `backups/capsule-reading-20261030/`。
- My Capsulesは読み込み中・空・絞り込み中も一覧用の高さを保持。内側だけをスクロールし、開いた枠が大きく伸びて飛ぶ挙動を解消する設計。更新中のopacityと内容タブの短い出現を追加し、reduced-motionでは省略。
- 内容タブ上部の一覧戻りとタブを一段に整理し、共有した版の履歴を図の後へ移動。スマホでは外側の二重枠と説明の占有を減らした。
- 会話の関連Capsuleは背景・枠のある小さな資料欄へ分離。個別CapsuleとCapsule一覧リンクを別タブとし、外部表示アイコン・ラベル・noopenerを付与。会話の閲覧位置や返信草稿を元タブに保持する。
- スマホの掲載確認で図の表示がフォーム末尾になる問題を発見。プレビューボタンの直後へ表示する配置に変更。
- 上記追加変更後もUI等81項目と型検査成功。関連リンクの別タブ/URL/relをテストへ反映。

### 実操作と未確認を区別

途中の `d0b57747` / β build `9J8at0cA7JXMpP1PDXDaB` で、既存Googleログイン状態から一覧→内容タブ（自動モーダルなし）→編集モーダル→閉じて内容へ戻る経路を確認。390×844と1440×960で画面を確認し、上部余白と掲載プレビュー配置を追加修正した。会話一覧への戻り、作者表示、掲載確認のPC二列・スマホフォーム、不要な掲載確認checkboxの除去も実画面確認。

ブラウザ標準の掲載取消確認を扱う途中、Computer UseがWindows上の現在URLを確定できず安全確認で停止した。そのため最新版 `fd9f39a3` の高さ固定・transitionの連続性、別タブ遷移、モバイルプレビュー位置の最終実操作は未確認。iPhone実機、実会員でのごみ箱→復元、最新版の共有作者/コメントの最終実操作も残る。機能テスト成功を人間による評価済みとは扱わない。

最新版はHTTPで両環境のGoogle provider応答と、未認証Capsule APIの401を確認。Python標準User-AgentのHTTPSアクセスはCloudflare1010になったため、通常curlで確認した。認証やCloudflare設定は変更していない。

### 資材検証中に修正したこと

1. private stagingのumaskによりimage内のソースディレクトリが0700となり、非root member-opsが読めなかった。別DBへの移行時に検出し、live停止前に中断。tracked sourceの権限を通常値へ正規化し、Docker cacheを使わず再作成した。秘密設定の権限は0600のまま。
2. symlink node_modulesを使ったβ Turbopack buildは、配置先を移すと外部pgのhash別名を解決できなかった。実認証経路で検出し、trashed_at全NULLを確認して直前Webへ復帰（DBは巻き戻さない）。従来同様webpackで再buildし、依存解決と実Googleセッションでの会員一覧を確認後、最新版も同方式で配置。

本番VPSは今回まだ更新していない（先行するGoogle公式対応 `5ed458cc` のまま）。018のみを追加する `scripts/release-capsule-reading-production.py` と固定資材を準備中。実画面の残りを確認し、固定資材の照合・sudo実行・正式URL確認・暗号化backup回収まで終えてから本番完了とする。

本番用候補資材（まだ未配置）: build `CJIYOm5CsRmTFDyWop5Ge`、Web `sha256:6790aa19e41d7f96380974e86f7f4f41677bf64695b8a142b2a7e23231cb95d2`、member-ops `sha256:0d16c393737472156fcf67eef499e79e7925eebaeadf96a07d22953a2ba0e560`。隔離起動でGoogle provider 200、未認証Capsule 401、session 200/nullを確認。VPS現状との照合・切替検証はこれから。

## 2026-10-31 追加指摘への対応（配置前）

コメントの補助操作を右上の共通メニューへ移し、名前・日時の揃いを修正。My CapsulesのlastOpened並べ替えを廃止し保存順を安定化。所有者用の認可付き掲載先一覧と、複数の掲載先へ別タブで進める折りたたみ導線を追加した。

AIラボでGoogle画像を遮断していたCSPを、プロフィールvalidatorで許すGoogle画像の4ホストだけに合わせた。支援ページへの直接アクセスではGoogle画像96pxの読込成功、AIラボを文書として開くと同じプロフィールの画像がfallbackになることを実Chromeで確認した。認証情報やAI artifactは変更しない。

保存済みダーク設定はhead内の小さい同期scriptでbody描画前に適用し、通常の設定操作・検証と同じテーマ許可値だけを扱う。不正なstorage/読取不可は従来のlightへフォールバックする。

検証：UI/clientの8ファイル82件、追加のテーマ初期化・掲載先UI4件、隔離PG/OIDC Capsule統合18件、tsc・変更TSのeslint成功。掲載先は複数community、固定版、別所有者拒否、community停止、参加世代変更を実DBで検証。初回追加テスト起動はシェルglob展開でbackup内の過去テストまで対象になったため停止し、argv配列・backup除外で正しい4件を再実行した。実ブラウザ接続はChrome再起動後に復旧した。配置と変更後の実操作は後続記録を参照する。

ユーザー指定：表示修正を先に反映し、Capsuleコメント通報は受付・運営確認・共有停止後の扱いを次のまとまりで続ける。

### 2026-10-31 表示修正を先行反映

- ソース `0914b06a9bf5d446c2709f7ab5faae2232e83670`、build `bl_h5IMsx6DgH7FIa0Du8` を3200／HTTPS βへ配置。DB変更なし、既存runtime・KG revisionを維持。Windowsの設定済みGit Credential Managerによる通常push成功（WSL側のcredential未設定によるpush失敗を解消）。
- 実GoogleセッションのChromeで、投稿者名／時刻の整列、右上の撤回メニュー、保存版リンクの分離を確認。既存投稿の撤回は実行していない。
- My Capsulesと共有パネルから、コミュニティ掲載先・参加者限定・保存版2の表示と別タブリンクを確認。閲覧前後で日時と並び順不変。複数掲載先／失効の排除は実PG統合テストで確認。
- 390×844で一覧を視覚確認。ヘッダは小さいアイコン列、一覧内スクロール、掲載先は任意展開。iPhone実機のキーボード・ブラウザバー挙動は今回のPC検証では再現しない。
- AIラボ・支援・プライバシーの3画面でGoogle画像の実読込（naturalWidth 96）を確認。AIラボはCSPの許可先修正。支援・プライバシーでは今回の現行コード上で画像欠落を再現せず、修正後の往復を確認した。
- トップでダーク選択→reload直後の暗い画面を確認。head内のbefore-paint scriptと単体試験を併用。動画の全フレーム解析ではない。検証後に元のライト設定へ戻した。

### 続くコメント通報の隔離検証（配置前）

- ユーザー指示に従い、先行表示修正の次に通報受付と運営処置を実装。既存受信箱へ統合し、共有IDを固定して失効後の内容確認を閉じる。
- 実PG／fixture OIDCのCapsule統合25件、既存サイト運営統合14件、投稿・メニュー・運営UI22件が成功。019再適用でledger・checksum不変。通報の同時再送、権限なし、私有版、他Capsule、旧版文脈、非表示／解除、withdraw、共有停止／再発行／ごみ箱／公開版停止／期限切れの境界を確認。
- 通報の本番・β配置、Google実操作は次の反映工程で記録する。


### 2026-10-31 コメント通報のβ反映・実Google確認

- 配置ソース `d1330ea8d5917f8c31d239fe7058c2380c554a2d`、3200／HTTPS β build `5O8HMYFaPiKps5cRvuky_`。両URLのbuild一致、既存KG revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`、private runtime・Google設定・他containerの保持を確認。
- 019適用に先立ちconsistent snapshotを別DBへ復元。既存34テーブルの旧列・全行、000〜018 checksumを比較し、019適用と再実行で旧行不変を確認。live停止直前の追加backup SHA256 `4dcead8c2e431e3f76697c945aa80b95447f4b5503c91903962217c90e08f92c`。ledger20件。private証跡は `backups/capsule-comments-20261031/beta-result.json`。
- 実Chrome／既存Google本人で、β確認用Capsuleの保存版4へ「β検証用」と明記した自分のコメントを一件作成。右上メニュー→通報フォーム→その他・理由→受付成功→自分の通報→運営受信箱→監査理由付き対象確認→対応終了まで操作した。対象コメントと通報理由だけが確認表示され、Capsule全体や他の投稿は出ない。完了後、未対応件数0を確認。通報ID `7d9ef37c-1ae9-4558-bb9e-b6201537da31`。既存ユーザー投稿の通報・非表示やアカウント処置は行っていない。
- 390×844で通報フォーム、PC幅で名前・日時・右上メニュー・版リンクの分離を視覚確認。検証後にviewportを解除。実機iPhoneのキーボード／アドレスバー挙動は未確認。
- 非表示／解除、withdraw後の確認拒否、共有停止／再発行／ごみ箱／期限切れ／公開版停止は実PG／fixture OIDC統合テストで検証。上記実Googleブラウザの確認範囲とは区別する。検証コメントと対応終了した受付・監査記録はβに残す。

### 本番反映の最終資材（管理者実行待ち）

- 固定アプリソースは同じ `d1330ea8`。正式環境向けbuild `1gqqeqXTNSzWUrDAFyWUn`。
- Web: tag `graph-knowledge-web:comments-d1330ea8`、config ID `sha256:4c710439659af542a2335cea6d483d53bd95f01a5a3ec160fc4ec4664f0882c3`、manifest ID `sha256:822024fa43d5d0adb1d962bff565e848ae35f24ff742ca68dfdd7df3482b3a2e`。
- member-ops: tag `graph-knowledge-ops:comments-d1330ea8`、config ID `sha256:9861bca084284aa5e3ef706865e06675ab9f52e9356f84127e041c6a06f9f9a8`、manifest ID `sha256:4d2bec63e5eb4dbbe42eb7fd24509f5841fcef6891629fe52204facbcd3166a3`。
- image archiveのconfig／manifest／全layerのsha256結合を確認。隔離Web起動でGoogle provider 200、未認証Capsule 401、session 200/null。最初のsmokeはDocker host networkをWSLから参照して到達できず、続く実行もDBへのnetworkが不一致で503だった。既知のDB container networkでread-only APIを検証し成功。公開設定や認証設定は緩めていない。
- 017時点の開発DB backupを隔離した別DBへ復元し、正式環境と同じDB host／DB名／role名／cookie prefix／originの検証条件で、018＋019を同じoperator関数とCLIにより適用・再実行。旧34テーブルの行不変、ledger18→20、CLI再実行無変更を確認。これは本番backupではないため、本番実行時もfresh backup・別DB復元・移行試験を繰り返す。
- 正式サイトのHTTPでは従来build `2ot-o4qNUifoDe2J2Pk_s`、KG revision `f5dbf83f-c89e-4e40-95ee-57957016089f` を確認。SSH接続可、`sudo -n`は不可。root audit・本番fresh backup／復元・018／019 migration・Web切替・正式URLの実操作・暗号化backup回収は管理者実行後に記録する。本番公開済みとは扱わない。
- 日本語commit・通常push済み: 表示 `0914b06a`、通報 `d1330ea8`。最終資材・検証記録は後続commit。無関係な自動候補は受入・確認済みへ変更していない。未追跡 `memo.txt` は保持。


## 2026-10-31 本番反映完了

本人のsudo実行は09:47 JSTに正常終了。Codexがactivation logと暗号化backupを回収し、正式URLの実操作・OGP・既存設定の保持を確認した。今回の追加修正は不要で、アプリはβで確認した固定ソースのまま。

| 環境 | アプリソース | 実build | 会員migration |
| --- | --- | --- | --- |
| localhost:3200 | `d1330ea8d5917f8c31d239fe7058c2380c554a2d` | `5O8HMYFaPiKps5cRvuky_` | 000〜019 |
| HTTPS β | 同上 | `5O8HMYFaPiKps5cRvuky_` | 000〜019（3200と同じruntime） |
| https://plunode.net | 同上 | `1gqqeqXTNSzWUrDAFyWUn` | 000〜019 |

Web／member-opsのtag・config ID・manifest IDは直上の最終資材と一致。Web manifest `sha256:822024fa43d5d0adb1d962bff565e848ae35f24ff742ca68dfdd7df3482b3a2e`、member-ops manifest `sha256:4d2bec63e5eb4dbbe42eb7fd24509f5841fcef6891629fe52204facbcd3166a3`。正式KG revision `f5dbf83f-c89e-4e40-95ee-57957016089f`、βKG revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`は変更なし。既存Google認証・運営設定・公式プロフィール・AI artifact・他サービスを保持。

### backup・migration・復旧資材

- 本番backup: `/opt/graph-knowledge/backups/capsule-reading-release-20261031T004719Z`。
- dump SHA256: `f89fe9e03ffe5606a4bc0057656bde86d172db4a0700aeaae8ce58d5d0c68c92`。
- fresh backupを別DBへ復元して34テーブルを照合。018／019の適用と再実行、既存全行・旧checksum保持を確認してからliveへ適用。ledger20件、二回目無変更。
- 暗号化archiveと暗号化鍵を開発PCへ回収。既存のローカル秘密鍵で一時領域へ復号し、archiveの構成・manifest・移行前ledger・dump hash・restore結果・activation logを照合。復号一時ファイルは削除し、暗号化資材はprivate backupに保持。秘密鍵をVPSへ送っていない。
- private証跡: `backups/capsule-comments-final-20261031/production-result.json`、`production-ogp-r1.json`、`production-ogp-r2.json`、各PNG、`production-stopped.json`。URL tokenや認証情報はGitの記録に含めない。

### 正式URLで実Googleセッションを使った確認

既存の「Plunode公式」Googleセッションで実行。新しいOAuthログインのやり直しは行わず、既存セッションの継続・会員API・公開プロフィールを確認した。既存のPLUNODE Capsuleやユーザー投稿には変更を加えず、「公開確認｜Capsule操作テスト 2026-10-31」を新規作成した。

1. 通常GraphのPLUTOからCapsule作成→タイトル変更→アカウント保存（保存版1）→限定リンク発行→別タブ閲覧。公式作者のGoogle画像と公式表示を確認。
2. 保存版1で確認用コメントを投稿。所有者側で浦沢直樹の関係先10件を読み、名前BILLYでBILLY BATを選択→条件を手塚へ変更して手塚治虫を選択。「2件を選択・うち1件は現在の条件の外」と選択済み2件を確認してまとめて追加。既存PLUTOは追加済みと表示。
3. タイトル末尾を「（更新）」へ変更し保存版2を保存。共有先の既存画面とHTTP OGPは保存版1のまま。明示的な「保存した変更を共有へ反映」で同じURLへ更新。既存閲覧画面は突然置換されず、新版の案内だけが出る。同じURLのreloadで保存版2・6対象9関係を表示。
4. 保存版1のコメントが残ったまま保存版2へコメントを投稿。それぞれに投稿時の保存版1／2リンクを表示。名前・日時、右上の撤回／通報メニュー、本文と版リンクの分離を確認。
5. 通報フォームが保存版2の対象コメントを指すことと390×844での配置を確認。**本番の通報は送信せずキャンセル**。受付→運営確認→対応終了の実Google操作はβで確認済み。非表示／解除・失効境界は隔離PG/OIDCの確認であり、本番の他人の投稿を操作していない。
6. 共有停止→元URLをreloadし本文・コメント非表示。HTTP OGPは一般の閲覧不可文言に変わり、直前のOGP画像URLも404。確認用Capsuleの再編集→一時タイトル変更→破棄で保存版2と元の題名へ復帰。
7. 確認用Capsuleのみごみ箱→復元→再訪し6対象9関係の内容を確認。ごみ箱／復元により保存版4となる。共有は自動再開しない。復元後の一覧日時10:00:12は、その後に開いて閉じても変わらず並びも同じ。確認用Capsuleは共有停止・復元済みの状態で残す。

### OGP・画面・残る確認範囲

- HTMLのタイトル・説明・og:url・画像URLを保存版1／2で比較。og:urlは同一、画像URLとPNGは更新される。正式ドメインのみを使用しβ／localhostを指さない。1200×630の保存版2 PNGを視覚確認し、題名・6対象9関係・図の特徴が一致。
- **SNS側の投稿前プレビュー／キャッシュ更新は未確認**。originが返すmetadata・画像の更新確認とは区別する。告知投稿はしていない。
- PC幅で実操作、390×844で通報フォームを確認しviewport設定を解除。iPhone実機のキーボード／アドレスバー挙動、全フレームのtransition解析は未確認。
- 今回の本番確認では公式アカウントが非運営者のため、運営処置の本番再実行はしていない。複数掲載先・コミュニティの世代変更・失効境界は上記隔離検証、Google実画面の掲載先／会話往復・画像／ダークreloadは先行β記録を参照する。本番の独立コミュニティへ検証投稿や設定変更を加えていない。
- 検証画像: `capsule-production-menu-20261031.jpg`（PCコメントメニュー）、`capsule-production-report-mobile-20261031.jpg`（390×844通報フォーム）。ローカルvisualizations領域に保管。

公開後記録は日本語commit・通常pushで保存する。無関係な自動候補の受入・一括確認済み処理なし。`memo.txt`を保全。公開runnerのguardはexit 0で解放済み。後続の確認用holdも記録commit／push後に解放する。Issue #63はCapsule先行公開と通報対応までの完了であり、知識申請・審査・本線受入は準備中のまま、Issueは閉じない。
