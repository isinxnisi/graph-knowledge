# Issue #63 Capsule本番公開記録

2026-10-30。ユーザーがβで確認したCapsuleの正式サイト公開。以前のβ限定範囲は今回の実行指示で更新した。知識申請・審査・本線KGへのマージは準備中のまま。

## 公開対象と環境

- 固定source: `20e5c84a99dd1e1bfa8fb69779729e68a914bb14`。共有URL更新・OGP・絞り込み・スマホ修正を含む最後のβ配置。後続 `28fe3aed`／`b26022e9` は検証・文書のみ。
- localhost:3200／HTTPS β: 同source、build `qJH6xIjxJa3LpgA6ArfO-`。今回アプリ変更なし。両方のAPIから確認KG revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb` を再確認した。
- 本番の更新前: build `lNabFN3qBIdd5U2lV6e6A`、Web image `sha256:f4e2a8e484c6c9906d89f163614567007d5b35575c5ac05976434edb238a52d4`。KG revision `f5dbf83f-c89e-4e40-95ee-57957016089f`、2,207対象／1,931関係。
- 本番の実物確認: migration000〜010の11件はsourceとchecksum一致、旧table29件。Google・会員・コミュニティ・運営・公開プロフィール・AIラボの既存設定を保持する。
- 本番切替: **管理者実行待ち・未反映**。SSHは接続済みだが、developにはDocker権限がなく、sudoはterminalへのパスワード入力が必要。読み取り専用確認はユーザーが実行し、結果を照合済み。固定済みの切替launcherを用意して実行操作を依頼した。切替ログはまだ生成されておらず、DB migration・Web更新・本番backupは未実施。

## 固定資材

| 資材 | 識別情報 |
| --- | --- |
| Web build | `vn4RKdqxP0bGkdHIbv3P4` |
| Web tag | `graph-knowledge-web:capsule-20e5c84a` |
| Web image | `sha256:ff19d9ce2dd45867993cf3e4cc227026878bd720f3d94f243c390ceee1b98c95` |
| member-ops tag | `graph-knowledge-ops:capsule-20e5c84a` |
| member-ops image | `sha256:e08e170d16e7b92b841273c6bd118b6946e6192bffee17ac5f3dba5ba49b9826` |
| image archive SHA256 | `034f710ed88f87173bc32e288d59fd65803ee69d1634f87258fc082977dab1a3` |

固定sourceのgit archiveから既存Dockerfileでlinux/amd64をbuildした。Webはstandalone版。βのDB・private env・実験artifactをbuild contextへ入れていない。VPSのdevelop用stagingへ転送し、archive・manifest・確認結果・実行script・復旧公開鍵のchecksumを照合した。既存KG用opsのpinは変更しない。

実行手順は `scripts/release-capsule-production.py`。確認時のcompose/env hash、container ID/image/build、ledgerを再照合し、web/member-opsのimage以外のCompose差分を拒否する。排他を保持し、Web停止後のfresh dumpを別DBへ復元して旧列全行を照合する。別DBへ011〜015を適用・再実行してから本番CLIへ進む。追加migration後は旧readerへ自動rollbackしない。暗号化した復旧exportの秘密鍵は開発PCのprivate recovery領域にのみ置く。

## 今回の隔離検証

- `scripts/test-capsule-release.ts capsule-20e5c84a`: 実際のWeb/member-ops imageと使い捨てPostgreSQLで成功。000〜010 checksum、別DBへのpg_dump/pg_restore、011〜015の復元先リハーサル、本番向けCLIの明示適用・再実行、全旧列行保持を確認。ledgerは16件。
- 同imageへのHTTPで、保存／再取得、通常保存では共有不変、同URLへの明示反映、private版404、コメントの対象版 `[1,1,2]`、共有停止後のJSON・PNG・metadata失効を確認。
- OGPは日本語タイトル・説明、`https://plunode.net/shared/...` のog:url・画像URL、1200×630 PNGを確認し、生成画像を目視した。これは隔離環境の合成Capsuleであり、本番発行リンクや外部SNSでのプレビュー確認の代わりではない。
- 認証は隔離DBの合成ユーザーとBetter Authの合成セッション。fixture入口を本番imageへ追加していない。Google callback URLが正式origin、fixture providerが400になることを確認した。
- Chromiumで実imageのスマホ幅→短いviewport→復帰→破棄→My Capsules→PC幅の経路が成功。確認KGへの読み取りと、専用PGの匿名状態を使い、既存βのDB・認証設定は変えていない。OSKの実挙動やiPhone実機の代替とはしない。
- 旧 `test-production.ts` の隔離KG起動・再適用・backup・再起動保持は成功。ただし同scriptが呼ぶ従来の公開ブラウザsuiteは、複数存在する`details`への単一selectorや古いログイン入口を前提に失敗したため中断。全suite成功とは扱わず、今回のCapsule用browser/API/image検証を別記する。旧selectorを直すためのUI変更は加えていない。
- `eslint scripts/test-capsule-release.ts`、公開scriptのPython構文・image2箇所だけのpatch・固定launcherのshell構文を確認。

## 正式URLでの確認

切替前にChromeの通常Googleログインを実行し、正式originへ戻り、本人の既存Capsule1件・プロフィールへの入口が表示された。新機能の確認は切替後に続ける。

## 保持事項

未コミットの`memo.txt`を保持し、無関係なAutopilot候補の受入・一括acknowledgeはしていない。本線KG、KG用ops、Worker、Kev、AI教育／予定、管理Connectorは変更対象外。既存AIラボ公開artifactのJSONは固定sourceのinitial.jsonと一致した。会員・コミュニティ・KGの削除やDB resetは実施しない。

## 再開点と記録commit

準備・検証・固定手順は `000f090e` でcommit・upstreamへ通常push済み。ユーザーが開発PCのPowerShellから `wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/7.graph-knowledge/backups/capsule-production-20261030/run-release.py` を実行する段階。sudoパスワードはterminal内で入力し、チャットへ送らない。事前確認のためだけの追加権限やpasswordless sudoは設定していない。

結果を受領したらAutopilot holdを再取得して確認する。activation.log、encrypted backupの回収と復号、正式URLでの実Google本人セッションによる作成・保存・同URL共有更新・コメント・停止・OGP・コミュニティ往復が残る。外部SNSの実カード表示も未確認。停止後に失敗した場合は先にログとledgerを確認し、固定scriptを無条件に再実行しない。今回の旧テスト失敗は検証環境とselectorの不一致として記録し、新機能成功に読み替えない。

手動holdは管理者実行待ちでの中断時に所定のterminal Enterで解放する。`autopilot assert-held`は各区切りで成功。追加の`autopilot status`はWindows連携のnull値エラーで失敗したが、最初のreview・token reviewと共通hold確認は成功しており、設定変更や失敗の一括acknowledgeは行っていない。
