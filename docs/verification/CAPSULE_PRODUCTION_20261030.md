# Issue #63 Capsule本番公開記録

2026-10-30。ユーザーがβで確認したCapsuleの正式サイト公開。以前のβ限定範囲は今回の実行指示で更新した。知識申請・審査・本線KGへのマージは準備中のまま。

## 公開対象と環境

- 固定source: `20e5c84a99dd1e1bfa8fb69779729e68a914bb14`。共有URL更新・OGP・絞り込み・スマホ修正を含む最後のβ配置。後続 `28fe3aed`／`b26022e9` は検証・文書のみ。
- localhost:3200／HTTPS β: 同source、build `qJH6xIjxJa3LpgA6ArfO-`。今回アプリ変更なし。両方のAPIから確認KG revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb` を再確認した。
- 本番の更新前: build `lNabFN3qBIdd5U2lV6e6A`、Web image `sha256:f4e2a8e484c6c9906d89f163614567007d5b35575c5ac05976434edb238a52d4`。KG revision `f5dbf83f-c89e-4e40-95ee-57957016089f`、2,207対象／1,931関係。
- 本番の実物確認: migration000〜010の11件はsourceとchecksum一致、旧table29件。Google・会員・コミュニティ・運営・公開プロフィール・AIラボの既存設定を保持する。
- 本番切替: **反映・正式URLでの代表操作確認済み**。2026-10-30 19:55 JSTに管理者がr2 launcherを実行。固定資材の照合、fresh backup・別DB復元、011〜015適用・再実行、Web切替・readinessが成功した。sudoパスワードは本人がterminal内へ入力し、権限設定は変更していない。

## 固定資材

| 資材 | 識別情報 |
| --- | --- |
| Web build | `vn4RKdqxP0bGkdHIbv3P4` |
| Web tag | `graph-knowledge-web:capsule-20e5c84a` |
| Web config digest（classic store） | `sha256:ff19d9ce2dd45867993cf3e4cc227026878bd720f3d94f243c390ceee1b98c95` |
| member-ops tag | `graph-knowledge-ops:capsule-20e5c84a` |
| member-ops config digest（classic store） | `sha256:e08e170d16e7b92b841273c6bd118b6946e6192bffee17ac5f3dba5ba49b9826` |
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

Chromeで通常のGoogleログインを実行し、正式originへ戻った本人セッションを使った。既存Capsuleを編集せず「公開確認｜PLUTOから広がる作者たち」と「公開確認｜共有停止テスト」を作成した。以下はfixtureではなく正式URLでの実操作。

- 通常GraphのPLUTOからCapsule作成、タイトル入力、明示保存、My Capsules再訪、再編集、未保存タイトル変更の破棄が成功。保存版・6 Entity／9関係・倍率が復元された。
- 浦沢直樹の関係先10件から、名前でMONSTERを選択→手塚へ条件変更→手塚治虫を追加選択→分類「作品」・関係「著者」で0件表示にしても2件の選択を保持。「うち2件は現在の条件の外」と選択名を確認して一括追加。Undoで4対象／6関係、Redoで6対象／9関係へ戻った。追加済みPLUTOは選択不可。
- 保存版1を限定リンク共有しコメント。所有者が版2を保存しただけでは、同じURLの再読み込みでも版1のまま。明示的な「保存した変更を共有へ反映」で同URLの共有版が2へ更新された。
- 開いていた読者画面は版1を維持。リンク再確認で新版通知だけが出て、明示的に「更新された図を読む」で版2へ切り替わった。更新前の投稿・新版公開後に旧図を見たままの投稿・新版を見た投稿は、対象版 `[1,1,2]` を保持。匿名の会話取得でもこの対応を確認した。
- 既存「本番公開確認用（運営者本人）」コミュニティへ版2を掲載し、既存の確認用会話と関連付けた。限定リンクだけを版3へ更新後、コミュニティを開き直しても固定版2。関連する会話→Capsuleへ往復でき、元の会話・投稿は保持された。掲載は既存の参加者限定範囲を維持する。
- 別の停止テストCapsuleで共有停止を実行。停止URLの画面は閲覧不可、本文API・OGP画像は404、HTMLに停止対象のog:titleを出さない。未ログインの会員Capsule一覧APIは401。非参加者・再参加等の全認可ケースは今回本番アカウントを増減せず、既存の隔離検証範囲と区別する。
- プロフィール・コミュニティ・通常探索・既存AIラボの閲覧を確認。AIラボの推論や設定操作はしていない。
- 本番共有ページを390×780のChrome viewportでも目視確認。PCで保存した倍率は維持されるため、狭幅で全体を読むには既存の「全体を表示」を使う。iPhoneのChrome・OSK・Safari実機は今回再確認していない。
- HTTPS βでも新しい確認タブからPLUTO→Capsule作成→破棄→元Graphを操作した。3200とβのAPIは従来の確認KG revisionを返し、今回不要な再buildはしていない。

### 本番OGP

発行した同一URLで共有版2・3のHTMLを取得し、タイトル・説明と`og:url`、`og:image`が正式originを指すことを確認。版3では画像URLの末尾が`/image/3`へ変わり、説明も共有版3に一致。1200×630 PNGを取得・目視した。Twitterbot／LinkedInBotのUser-Agentでも正式HTMLを確認したが、これを外部SNSの実カード表示確認とは扱わない。

LinkedIn Post Inspectorへ正式サンプルURLを入力してInspectしたところログイン画面へ遷移したため、**外部サービス上の実カード表示・キャッシュ更新は未確認**。SNSへの告知投稿は行っていない。

privateな`backups/capsule-production-20261030-r2/`に`formal-verification.json`、`production-ogp.png`（版2）、`production-ogp-v3.png`（版3）とactivation.logを保持する。確認用共有URLはユーザーへ渡し、限定リンクtokenを公開Git記録へ転記しない。

## 保持事項

未コミットの`memo.txt`を保持し、無関係なAutopilot候補の受入・一括acknowledgeはしていない。本線KG、KG用ops、Worker、Kev、AI教育／予定、管理Connectorは変更対象外。既存AIラボ公開artifactのJSONは固定sourceのinitial.jsonと一致した。会員・コミュニティ・KGの削除やDB resetは実施しない。

## 作業と記録commit

準備・検証・固定手順は`000f090e`、管理者実行待ち記録は`ca0b6ac8`、image識別修正と5件の単体テストは`190dbe14`で日本語commit・upstreamへ通常push済み。管理者実行待ちの各中断でholdを所定のterminal Enterで解放し、再開時に取得・token reviewを実施した。完了記録も同じ通常手順でcommit・pushし、最後にholdを解放する。

各区切りの`autopilot assert-held`は成功。追加の`autopilot status`はWindows連携のnull値エラーで失敗したが、最初のreview・token reviewと共通hold確認は成功している。設定変更や失敗の一括acknowledgeは行っていない。既存の未コミット`memo.txt`は保持する。

## 初回切替の停止と識別照合の修正

ユーザーが固定launcherを実行し、archiveの転送後照合とdocker loadの後、`Loaded image differs`で停止した。停止箇所はWeb停止・backup・migrationより前。既存Webの正式HTTPSとKG revisionが継続して応答することを再確認した。初回root staging／activation.logは保持する。

実archiveと既存VPS更新手順に照らして調査し、Docker classic storeのconfig digestとcontainerd storeのmanifest digestを区別していなかった公開helperを修正した。検証済みarchiveからタグごとのconfig→manifest→全layerを結び、各blobの実byte hashを一巡で検証する。Dockerのdriver-typeに対応したID、platform、RootFS layer列、source labelを照合するため、任意のIDを許容する緩和ではない。

- Web OCI manifest: `sha256:3b6738c74fad01f1acb8d45b48d8d463374babf4db255208ee74a9e92980ac2f`
- member-ops OCI manifest: `sha256:8bd83d83f24aa074dc535ff4e6743dee8485ad66af24bd571f910fd78be60090`
- app source・build・archive byteは変更なし。`tests/test_capsule_release.py` 5件でclassic/containerdの区別、別ID／platform／source／layer／未知storeの拒否、archiveのタグ対応・layer破損の拒否を確認。実archive全blobとローカルDocker imageの照合も成功。

再開用資材はprivateな`backups/capsule-production-20261030-r2/`とVPSの対応stagingへ固定する。初回root stagingを編集・削除せず、r2のroot専用stagingから初回と同じ稼働構成・ledgerを再確認して進める。復旧export先もr2で分ける。VPSが返す実manifest IDはr2のimage-identityログで上記OCI manifestと一致することを確認した。

## 本番移行・復旧資材の実結果

r2の`activated`を受領し、SSHからactivation.logを回収して照合した。VPSで稼働するWeb/member-opsは前節のOCI manifest ID、Web buildは`vn4RKdqxP0bGkdHIbv3P4`。アプリsourceは`20e5c84a99dd1e1bfa8fb69779729e68a914bb14`のまま。公開helperの修正によるアプリ再build・デザイン変更はない。

- backup: `/opt/graph-knowledge/backups/capsule-release-20261030T105540Z`
- custom dump SHA256: `0c924de2f7a6ce1055d2d94949aa236a3ead4b4eecaa6bfcc43db8b5c7ad7a5f`
- 復元先: `graph_member_restore_capsule_20261030105542`。別DBへの復元後に29tableの既存列・全行を照合。011〜015適用と同コマンド再実行でも旧値を保持。確認後に検証用DBだけを撤去した。
- 本番も011〜015を明示適用、ledger16件。000〜010 checksumは不変、既存行保持・再実行無変更を確認した。
- 暗号化exportを開発PCのprivate recovery領域へ回収し、秘密鍵で復号してdump hash・29table・ledger16件の照合結果を確認。復号用の一時平文tar/keyは削除し、秘密鍵・暗号化backup・検証結果をprivateに保管した。本番DBへのrestoreはしていない。
- PG／Neo4jのcontainerと起動時刻、KG revision、既存AIラボartifact、既存settingsは不変。変更したCompose値はWebとmember-opsのimageだけ。

本番反映と代表操作は完了。知識申請・審査・本線受入は未実装の準備中で、Issue #63全体を完了扱いにしない。外部SNS実カード、iPhone実機、複数実会員による全権限パターン、従来公開E2E suiteの古いselector修正は今回の未確認／残課題として区別する。
