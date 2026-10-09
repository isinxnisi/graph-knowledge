# アカウント・共有・議論の先回り設計と自動実行の参照

2026-10-09。ユーザーの依頼により、重要機能が未設計を理由に着手されないことを避けるため、初回契約を用意した。現役仕様は[アカウント](../../design/ACCOUNT_AND_OWNERSHIP_DESIGN.md)／[コミュニティ](../../design/COMMUNITY_VERTICAL_SLICES.md)、自動開発の進め方は[AUTOPILOT_DIRECTION](../../AUTOPILOT_DIRECTION.md)。今回アプリの認証・DB・API・UIは実装していない。

## 基準と採用範囲

mainの確認時HEADは`02e9a2c`。現在のブラウザ保存、公開KG API、Neo4j正本、Capsule構想、プリセット／会員保存、プロダクト原則と、インストール済みNextの認証ガイドを確認した。Better AuthのNext・PostgreSQL・Google・session・account公式仕様も確認した。

- UserとKG Personを分け、ownerはサーバーsessionから付与。初回はBetter Auth＋PostgreSQL、一つのGoogle providerを案とする。
- 登録単独で終えず、privateな一種類の保存→再閲覧→根拠／探索へ戻る縦経路にする。実credentialが必要なlive接続と、開発用認証fixture・実DB検証を分ける。
- 共有はCapsuleの指定内容版と失効可能なリンク、議論はCapsuleの安定対象と投稿時の参照版。公開／moderation／Global受入を分ける。
- 完全な投稿制度、Claim歴史版、課金、全管理画面をaccount／Capsuleスレッドの初回依存にしない。退会・個人情報保持・公開運用は導入段階を区別して残す。

## 自動実行への反映

main側の短い方針に初回契約と二つの参照先を追加した。全設計を毎回promptへコピーせず、選んだ機能に必要な文書だけを読む。専用worktreeにまだ文書がない場合も、runnerがmain側designの読取先を明示する。main側の編集・app/test/DB操作は禁止のまま。

kit runnerの「authenticationを変更しない」「認証や前提が不足したら終了」は、Codexの認証保護と製品authの開発を混同し得た。今回、保護対象を自動実行自身へ限定し、製品credential不足はlive接続だけを止めると明記した。外部公開・実課金・実credentialの変更禁止、ロック、45分期限、6行報告、利用量上限処理は維持した。

インストール先は`/home/isinxnisi/.local/share/graph-autopilot`。実際に変更したrunnerの二文とfixture回帰1件を[再現用patch](20261009_ACCOUNT_COMMUNITY_RUNNER.patch)へ保存した。適用対象はこの時点のkitであり、将来のkitへ無条件に上書きしない。

指示体系の参考：[OpenAI公式のAGENTS.mdガイド](https://developers.openai.com/codex/guides/agents-md)。本プロジェクトでは既存のmain方針注入と必要な設計の参照を使い、全体指示や将来規則を増殖させない。

## 検証

- `make autopilot-test`：20件成功。排他・受入・休止・dirtyの既存運用。
- `python3 /home/isinxnisi/.local/share/graph-autopilot/tests/test-handoff.py`：5件成功。追加1件は製品auth許可、Codex認証保護、main設計の読取先、source／HEAD不変を確認。
- 更新したmain方針全文と二つの設計を隔離fixtureへ置き、実runner→fake CLIのpromptに方針全文・参照先・認証境界・6行報告が渡ることを確認。fixture source／開始HEADは不変。実Codex・予定実行を追加起動していない。
- `bash -n`、文書の相対リンク、`git diff --check`を確認。再現patchは隔離コピーへ逆適用／再適用して一致を確認。
- アプリコード・依存・API・DB・dataset・稼働画面を変更していないため、アプリのunit／integration／Playwright／buildは再実行していない。

10:00の予定実行は終了まで待ち、共通ロック取得後に反映した。最小Capsuleの`29efa6a`が正常終了・clean・未受入1件となったことを確認したが、今回の設計作業ではmergeや受入済み扱いをしていない。次回がどの機能を選ぶか、設計から適切に実装へ進めるかは今後の実行結果で確認する。
