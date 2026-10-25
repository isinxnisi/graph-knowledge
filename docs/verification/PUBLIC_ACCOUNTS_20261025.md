# Issue #39 公開プロフィール・公式AI活動基盤の検証

2026-10-25。独立worktree `/home/isinxnisi/1.projects/.worktrees/graph-issue39-accounts`、branch `codex/issue39-official-ai-accounts`。開始時の最新main／origin/mainは `9efbd43c4da5bf56630460c0c5a435ea58b100b5`。Issue全文・コメント（0件）、既存AI育成ラボ・会員・コミュニティ・運営を確認した。

## 協調と実装境界

開始時に全worktreeの状態・branch・mainとの差分、既存Codex「AI-LAB:実装を開始」のidle状態と担当範囲を確認。AI実験branchは `codex/ai-lab-foundation`／`af31afd5523655da45d2ceab87e0bca37cecd7dc`、公開ラボbranchは `codex/issue36-ai-lab-publication`／`02bf1c5e2e861937b0fdb2157b73a684f322a957` を保全する。各既存worktreeに未commit変更はなく、mainに既存の未追跡 `memo.txt` だけがある。これを移動・削除・commitしない。古い実験branch全体はmergeしない。

Autopilot reviewは未受入0件、自動側clean、固定自動SHA `5c357e440d45b95e6fd3325bfd36c8fed3162b46`。共通holdを取得してtokenによるreview／assert-heldを継続。Windows status取得は既存のnull式エラーとなったため、Windows設定は変えずOSロックとLinux側reviewを基準とした。今回の手動branch受け入れを別の自動成果の受け入れと扱わず、complete-acceptanceによる無関係な休止解除はしない。

AI育成基盤の探索・推論・評価・学習・不変run/artifactには変更しない。今回の担当はAIIdentity、人間／AIの公開プロフィール、公開投影、フォロー、既存画面の公開導線。共通ファイルは接続に必要な変更だけ。人物UserへのAI混入、AIの認証session、コミュニティ参加権、架空コメントは追加しない。

実装契約は [PUBLIC_ACCOUNTS](../design/PUBLIC_ACCOUNTS.md)。追加migrationは009のみで、000〜008は不変。公式AI画像2点は指定固定commitのbytesを保持し、見習いの既存画像・安定IDと分離した。

## 隔離検証

| 対象 | 結果 |
|---|---|
| production build／型 | Next 16.3.8 webpack成功。build `wB2V-kS7P7DtuvvrE0q8g`。worktree外node_modules symlinkに対してwebpackを使用し、型検査を省略しない |
| lint | 全体lint成功、最終変更箇所もeslint成功。既存語彙の人間意味レビュー警告のみ |
| 通常suite | 71ファイル・856件成功。共有認証／アカウント／コミュニティ／ラボの最終重点6ファイル・43件も成功（856と重複する再確認） |
| 新規アカウントAPI | 独立PG＋実OIDCで16件成功。署名・nonce・PKCE・Better Auth DB sessionを経由し、認証headerの偽装でログインしない |
| 既存API回帰 | 会員33、コミュニティ29、安全性14、運営14件、計90件成功。新規込み106件。既存beta／本番会員DBを試験先にしない |
| 実ブラウザ | 独立PG／OIDC／実Next UIの10シナリオ成功。公開プロフィール登録・公開投稿者→プロフィール・フォロー／解除・フォロー中・非公開化・遅着応答排除・編集競合・Origin／期待Userを確認 |
| 表示 | JA／EN × 1440／390px × light／dark-blueの8条件成功。公式AI・見習いの別画像、0件表示、横はみ出しなし。Chromiumによる幅検証で、iPhone実機の確認とは区別する |
| 移行・復旧リハーサル | 既存betaのprivateなdumpを別名PGへ復元し、全24テーブルの内容を照合。さらに復元DBへ009を2回明示適用し、既存列の内容・000〜008 ledgerを保持。AI2件、人間プロフィール自動作成0件、ledger10件を確認 |

APIでは匿名・本人・別User・AI安定IDを偽装したheaderを組み合わせた。未登録者の認証名・Google情報・内部User UUID、限定コミュニティ／cohortの題名・本文・参加関係・存在・件数・時刻・URLが公開投影へ出ないことを確認。本人も公開プロフィールAPIから限定情報を回復できない。

public→members→publicで旧cohortが復活しない、withdraw／hide／community suspensionで除外、作者の退出・再参加やUser停止・再開で旧世代を復活させない、退会でprofile／followが消えてhandle墓標だけ残ることを確認。AI停止・再開は監査付きCLIのdry-run／applyで検証。フォローは限定スレッドを404のまま保ち、AI sessionを作らない。

コミュニティのlockを待つ公開読取と、User lockを待つprivacy読取を実DBで試し、変更commit後に再認可されることを確認。署名cursorは公開境界だけを含み、各ページを再認可する。非公開タイムラインは空配列・null cursorで、最新活動時刻や全件数を返さない。実ブラウザでも古い公開応答を保留し、非公開化後の再検証結果を上書きしないことを確認した。

初期ブラウザ実行は共有ライブラリ不足で起動しなかったため、既存 `/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu` を指定。途中の試験selectorの重複・矢印付きリンク名の不一致を直し、最終10件を一括再実行した。旧schemaからの移行試験では、auth runtimeの初期化とmigrationを競合させない専用bootstrap poolに修正した。これらの失敗を最初から成功していたとは扱わない。

## beta反映

この実装commit時点は隔離検証完了。固定SHAをレビューしてmainへ受け入れた後、既存3200／graph-betaへ反映し、結果を本節へ追記する。正式VPS・本番会員DB・KG・Kev・CollectionWorker・自動runnerは変更しない。

private backup・元runtime設定・元`.env.public`・復元リハーサルの原記録は、このPCの `~/.local/share/plunode-backups/issue39-20261025/` に保持する。秘密値・dump・実会員の内容をGitへ含めない。[公開前の適用・backup・復旧手順](../runbooks/PUBLIC_ACCOUNTS_RELEASE.md)を参照。

## 確認先

隔離UI画像：[公式AI・PC日本語](public-accounts-20261025/official-ja-desktop.png)／[見習い・スマホ英語ダーク](public-accounts-20261025/apprentice-en-mobile-dark.png)／[本人選択の編集](public-accounts-20261025/profile-settings.png)／[非公開タイムライン](public-accounts-20261025/private-timeline.png)。会員は検証専用で、実beta会員の画像ではない。

- [公式AI・日本語](https://graph-beta.isinxnisi.com/people/plunode-official-ai)／[English](https://graph-beta.isinxnisi.com/en/people/plunode-official-ai)
- [探索者見習い・日本語](https://graph-beta.isinxnisi.com/people/explorer-apprentice)／[English](https://graph-beta.isinxnisi.com/en/people/explorer-apprentice)
- [プロフィール編集・公開設定](https://graph-beta.isinxnisi.com/member#account-settings)／[フォロー中](https://graph-beta.isinxnisi.com/following)

人間プロフィールの初回公開は本人が名前・紹介・アイコン・タイムラインを選ぶ。betaの既存Google情報から代筆・自動公開しない。正式VPSでの明示009適用・Web反映、Safari／iPhone実機確認は今回の適用範囲外。AIの実推論・教育・自動コメントは後続であり、この基盤の未完成機能として水増ししない。
