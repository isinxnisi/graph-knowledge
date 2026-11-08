# R6a 正式公開の準備と未実施の境界

**2026-11-08後刻訂正：Linuxのsecurity候補0件は、CVE対応完了を意味しなかった。** 同名の既存packageと-security originだけの集計で、-updatesのkernel更新・新ABI依存package・稼働kernelのCVEを見落とした。[実機照合と是正](LINUX_SECURITY_R6_20261108.md)。

2026-11-08 最終更新：R6aの監査・実物復元／再実行・暗号化backupのPC復号・正式資材の照合まで完了。R6bは既存sudoによる切替待ち。正式候補はapp `027f89bf`／build `Sf6Myn-qsOSMt8bnqxpE9`。本番はまだ旧版。下記の初期準備記録と、末尾の「R6aの最終資材・切替待ち」を区別する。


2026-11-08。**R6a作業中｜R6はbの正式確認まで｜全体はR6まで。** R5完了後の継続指示を受け、正式公開の準備へ進んだ。本番のDB・Web・OSはまだ更新していない。資材の検証やVPSへの転送を公開完了と扱わない。

## 確認先と現在の実行物

- [localhost:3200](http://localhost:3200/)／[HTTPS β](https://graph-beta.isinxnisi.com/)：セキュリティ更新を配置済み。実行ソース `027f89bfc8c2e4605ffce1ca789f814081f18b1b`、build `RTmRnpoWCYnN5rgv2CLlz`。本人ログインはHTTPS βを使う。
- [Webbの年表・関係図](https://graph-beta.isinxnisi.com/?ktheme=u3%3Afbaa9ee12f288cfa%3Atheme&krev=5&kview=split)：Googleログイン済みのChromeで表示、Capsule作成画面、未保存の作成を破棄して探索へ戻る操作を確認。新しい保存や共有は作っていない。
- [正式サイト](https://plunode.net/)：従来版のまま。実物監査で旧Web source 3a533256／build gICsYdcWaoj_SCu-Pm6jh、会員migration000〜019の20件を確認。正式切替は未実施。

R5の原文・訳文・版の表示整理、共有更新・コメント・公開停止、移行・復旧の実績は[前段の検証](KNOWLEDGE_INTEGRATION_R5_20261108.md)を活用した。これらの全操作を今回もう一度実施した意味にはしない。今回のブラウザ確認はPC幅で、R5の390px検証は再利用した。iPhone／WebKit実機ではない。

HTTP単独確認では3200と正式サイトのdataset APIは200。Python urllibからのHTTPS βはCloudflareの403／1010となった。アプリ由来の500やトンネル停止と同一視せず、実Chromeで確認した年表・Capsuleの結果と分けて残す。今回Cloudflareの保護設定は変更していない。

![更新後のHTTPS β・Capsule作成](assets/knowledge-r6-20261108/beta-capsule.png)

## 公開資材の修正

1. registryのadvisoryに基づき、Next／eslint-config-nextを16.3.8から16.4.5、fflateを0.8.2から0.8.3、Viteのtransitive lockを8.3.2から8.3.6へ更新。ReactとNodeの版は変更していない。`npm audit --omit=dev`の検出は0。実際のアプリ機能からの攻撃成立を実証したものではなく、VPS OSの検査結果とも別である。[Next advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw)／[fflate advisory](https://github.com/advisories/GHSA-px8p-9vwx-vf98)。
2. 既存の変更境界81テスト、移行CLIのlint、型検査込みβ buildが成功。β buildは192.2秒。既存16設定とGoogle認証を引き継ぎ、Webと既存5 Workerを再開。βのDB migrationや利用量上限は変更していない。
3. 本番Docker buildで、収集MCPが使う共通clientとテーマ設定の同梱漏れを確認し修正。Web／運用imageに実行時のchecksum照合用SQLを含めた。秘密値・private profile・β DBはbuildしない。
4. `data/theme-discovery.production.json`を正式用の紹介テーマ設定として分離。初期値は空で、βの実験用テーマIDを正式用に使わない。新着一覧は正式DBの公開テーマを読む。元のβ紹介設定は維持する。
5. 既存のWeb／member-opsへoverlayし、publisher／review／patrolを別processで起動する資材を追加。既存のKG opsを置き換えない。設定はread-only、収集APIの再送checkpointだけはWeb専用の永続ディレクトリへ保存する。新Workerにも既存KGの接続先を明示継承する。

## 検証した正式候補image

固定ソース `12273b176ffd788da42c0f41eb4e4b0dcde63254`、linux/amd64。ソースのgit archiveを使い、未コミット変更・`.local`・環境ファイルはcontextへ混ぜない。

| 資材 | 識別情報 |
| --- | --- |
| Web | `plunode-web:r6-12273b17`／config `sha256:986eb6472e4ca5b3241bb6b0632398f1ac776a2a09be041212ce1379c76f315c` |
| 正式候補build | `4HA4J9PvlJxJdsWuxlIBA` |
| 運用CLI・Worker | `plunode-knowledge-ops:r6-12273b17`／config `sha256:65a26eb72991857a680a65b6533c823fc34f9f21bec3b6907990ec2b075c733b` |
| image archive | 580,830,980 bytes／SHA256 `917e31d92d89778a73f289b9fdfe69afc79fa7a936f0b2ae03e8117e63097266` |

Webのmanifest IDは `sha256:e04a25e8228720c25b84b82e7576cda8f0896671fbab9f662e4baa998861252d`、運用imageは `sha256:64d1aa221699d1960ed02dc92aac9fe662c483f6cbbfca96357e24c27ca5d913`。既存のarchive照合関数を再利用し、config・manifest・全layer bytesの対応を照合した。Dockerのimage storeの違いを、imageが違うと誤判定しないため両IDを記録する。

ビルドはWeb156.2秒、運用image21.1秒。Cドライブの最小空き17,020,317,696 bytes。既存image／cache／volumeの一括削除は行っていない。候補資材をVPSのprivate staging `/home/develop/plunode-r6-20261108/`へ転送し、同じarchive SHA256を確認。**load・起動・切替はしていない。** 公開条件や実機監査により追加修正が必要なら、確定資材は別に記録する。

backup持出し用の新しい復旧用鍵も準備し、公開鍵だけをstagingへ転送した。秘密鍵はPCのprivate領域に0600で保持する。候補資材5点のSHA256をVPS側で再照合済み。これは本番データのbackupを作成した意味ではない。

## 別DBとimageの境界確認

今回だけの所有ラベル付きPostgreSQLで、image内のCLIをproduction profile・正式origin・独立DB／roleで実行した。実Googleのsecretやβのdumpは使わず、外部AIへの送信は行わない。

- 会員migration000〜035の36件を空DBへ適用し、再実行してname／checksum／applied_atが不変。
- 知識migration001〜009の9件を空DBへ適用し、全9件を再実行して台帳不変。原本objectは0のままで、seedしない。
- 誤ったorigin、会員DBを指定した知識移行、適用済みchecksumの変更は拒否。既存SQLのchecksumを書き換えない。
- standalone Webだけで起動し、会員capability200、未認証session200/null、非公開Capsule API401を確認。Web内に36 migration＋role準備SQL、知識9 SQLがあり、`.env.public`と`.local`はない。正式用の紹介テーマIDは空。
- Composeの結合を検査し、9サービス、既存KG接続の継承、設定read-only、再送状態の書込先がWebだけであることを確認。
- 運用imageでreview／patrolのstatusを読み、AI送信台帳0を確認。追加した空のNeo4jへ初回の公開世代を投影し、standalone Webのテーマ一覧が200・0件になることも確認。検証後は今回の所有ラベルを照合してcontainerとnetworkだけを撤去した。

これは**本番のbackup／復元／移行の成功を意味しない**。本番の追加migrationは現在のledgerを監査してから確定し、本番Member DBからのbackupと別DB復元を行う。R5のβ backupを本番へ戻さない。

初回のimage buildは同梱漏れで停止した。検証手順ではrole準備SQLをmigration数へ誤算入したassertを修正し、Neo4jのcold startを8秒／30秒で打ち切る待機処理も見直した。これらを公開成功や本番障害と扱わない。privateな手順・ログは作業領域の `.local/r6-production-20261108/` に保持する。

## 残り・再開

R6aの残り：本番の実物監査、Linux security pocketの確認と適用計画、本番Member DBに対する未適用migrationの確定・backup／別DB復元、正式用private profile／一般提供条件の整理と確定済み共有AI予算の切替、切替runnerの実機条件との照合。

SSHは接続できるが、既存sudoはパスワード必須で、developからDockerを操作する権限もない。読み取り専用 `audit.py`を転送し、SHA256 `a67f893209700f1bfdd21002c50904b48a1bede548c791980d82063ad59c96fe` を確認して本人へ実行を依頼した。結果の `/home/develop/plunode-r6-20261108/audit-result.json` を取得し、秘密値を出さずに確認して再開する。転送済みの監査scriptを途中で差し替えない。

Gemini無料APIの一般提供条件（18歳以上・提供地域）は方針了承と実装要否の質問を受け、最小の反映範囲を整理中。同一projectの予算は本番300回・β100回で確定した。利用者の範囲を勝手に縮小したり、βと本番へ各400回を設定したりしない。[公式条件](https://ai.google.dev/gemini-api/terms)。課金・別キーでの迂回・管理者による通常の承認作業は追加しない。

R6bは本番切替、正式originでのGoogle・PC Worker・既存の同じChatGPT会話へのAPI接続、代表操作、OGP・正式URL、必要なLinux更新後の復帰確認。本人のOAuth同意が必要な操作は、その時点で具体的に示す。まだ実施していない。

3200／HTTPS βの再開はmainで `python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node`。既存台帳・private設定から再開し、DB resetや資格の作り直しをしない。3276、共有Kev、AI教育、ChatGPT／Codexの予定は今回変更していない。


## 本人回答後：利用量確定と監査の再試行

本番300回／日・β100回／日を確定。月次9,300／3,100、RPM9／3、入力TPM150,000／50,000、日次入力・出力それぞれ1,500,000／500,000、月次それぞれ46,500,000／15,500,000のprivate候補を準備した。同じproject・既存modelを維持し、現行schemaと合計を検査済み。適用は正式AI起動前にβから行う。準備時のβ台帳はprovider日付2026-11-07で5回、月次412回。切替直前に消費・予約を再確認し、超過分を無視した二重割当をしない。[現行契約](../design/KNOWLEDGE_AI_BUDGET.md)。

本人の最初の監査コマンドは kex_exchange_identification: read: Connection reset by peer で認証前に停止。こちらでも接続成功と同じ切断を確認したが、原因は特定していない。確立した既存SSH接続を再利用するhelper backups/knowledge-production-20261108/run-audit.pyを開発PCへ用意し、--checkで接続と転送済みauditのSHA256を確認した。引数なしの実行は同じ読み取り監査だけを既存sudoで実行し、PWはterminalから入力する。監査結果は受領後に別途検査する。

年齢・地域の方針は了承されたが、内部でのAI利用にも特別な実装が必要かという質問を受けた。公式条件は組込先のAPI Clientにも条件を課しており、単にサーバーから呼ぶことで対象外とは言えない。一方で、身分証確認や生年月日収集の専用基盤を必須とする記載は確認できない。利用条件と既存送信同意への最小の反映を基本とし、AI機能だけの制限でサービス全体への条件を満たすと断言した先の提案は訂正する。全Graph閲覧を18歳以上へ変更したり、未実装のgateを実装済みとしたりしない。[公式条件](https://ai.google.dev/gemini-api/terms)。

今回の追加AI送信・DB migration・アプリbuild・サービス切替はない。β／3200は前段のbuildを維持し、正式サイトは旧版のまま。通常pushとhold解放は実行結果を完了報告に記載する。


## 本番監査の受領と実物復元の準備

2026-11-08 10:47 JSTの読み取り監査を受領。接続再利用helperで本人がsudoを実行した。監査によるDB・Web・OS変更はない。

- 正式Webはsource `3a533256`／build `gICsYdcWaoj_SCu-Pm6jh`。会員DBはgraph_member、知識DBはまだない。
- 会員34表、適用済み000〜019の20件は現在のSQL checksumと一致。追加020〜035の16件、新しい知識DBには001〜009の9件を適用する。seedしない。
- Google認証・会員・コミュニティ・運営設定を実物で確認。AIラボartifactは候補imageと同じhash。旧KGのpublic-kg revisionは保持する。
- Ubuntu 24.04、kernel 6.8.0-147-generic、RAM約4GB、空きdisk約135GiB。PG上限30接続は、新Worker同居に合わせて調整を検討する。DB別role・専用世代label・追加Neo4jなしの構成を維持する。
- APTのキャッシュ一覧だけではsecurity pocketを判定できない。metadataの再取得とsimulate結果から適用リストを固定する。

`scripts/prepare-knowledge-production.py`を追加（commit `4a89755d`）。現在のCompose／env／build／ledgerを照合し、Member DBのexported snapshotを保持して、同じsnapshotで表構造・所有者・行fingerprintとcustom dumpを得る。隔離network／一時PGへ復元し、16件の追加migrationと再実行、旧行／所有者の保全を確認する。Web停止・本番DB移行・OSパッケージ更新・公開切替は行わない。

PCの独立PGで、snapshot後の同時更新・追加をdumpへ混入させず、同じsnapshotのfingerprint／所有者と復元先が一致することを確認した。本番での成功とは区別する。準備helper `backups/knowledge-production-20261108/run-preparation.py`は転送・SHA256照合済みで、本人がsudo実行済み。実物の34表→84表／36 migrationと再実行不変・旧行／所有者保持を確認した。

復旧資材はVPSのroot専用backupへ保存し、PCへの取得分はAES暗号化＋RSA-OAEPで包んだ鍵とする。秘密鍵はPCだけに保持し、VPS／Gitへ送らない。PCで復号・dump hash照合が済む前に復旧確認済みとしない。

### 一般提供の案内

既存の送信確認とprivacy説明へ18歳以上・提供地域の条件を短く追記した（app `027f89bf`）。現在の送信先名は詳細説明へ保持する。訳文生成は公開原文＋文脈から私有草稿を作り、生成だけでは自動公開しないことも明記した。

身分証・生年月日収集や新しい同意DB／workflowは追加しない。これは案内更新であり、厳密な年齢／所在地検証を実装した意味ではない。API Client全体への条件をAI機能だけの制限で満たすと公式に確認した意味にもせず、公開Graph全体を勝手に年齢制限へ変更しない。[公式条件](https://ai.google.dev/gemini-api/terms)／[提供地域](https://ai.google.dev/gemini-api/docs/available-regions)。

案内3画面はeslint error 0（既存Hook warning 1）、TypeScript検査成功。追加migrationはなく、beta／正式buildは完了し、betaは下記の再配置後に確認した。旧候補12273b17でのSQL／復元検証は、最終資材でもSQL checksum一致を照合して活用する。


## R6aの最終資材・切替待ち

本人実行の準備結果を受領。本番Member DBの34表を分離PGへ復元し、84表・会員36 migrationへ移行した。旧行・所有者を保持し、再実行でも変化なし。dump SHA256は`2250240533a952ca56cf8dba5596fdc6d493e9fc7ad9be535791c3d846ec7b3d`。VPS backupは`/opt/graph-knowledge/backups/knowledge-r6-preparation-20261108T021314Z`。PCでRSA-OAEP鍵とAES暗号化backupを復号し、dump／旧Compose／envのhash一致まで確認した。

APT metadataの更新は成功。noble-securityの4componentの配布元も確認し、追加security版があるインストール済みpackageは0件。OSパッケージの更新は実施していない。これは全ソフトウェアの脆弱性不存在の保証ではない。

| 資材 | 最終候補 |
| --- | --- |
| アプリsource | `027f89bfc8c2e4605ffce1ca789f814081f18b1b` |
| 正式build | `Sf6Myn-qsOSMt8bnqxpE9` |
| Web tag | `plunode-web:r6-027f89bf` |
| Web config ID | `sha256:b6f0ab7b43cb8e79851579b1dff1e713b1122a9303beea4cf16fff4a88fe693a` |
| Web manifest ID | `sha256:d70a6aa1ecf562d30b83bb3017927c77246b1a5c644a12fb83751d1eead5b42c` |
| knowledge-ops tag | `plunode-knowledge-ops:r6-027f89bf` |
| knowledge-ops manifest ID | `sha256:f0af81bac0f894c945b4575369d5c9dbfc4c7521e546803b63790405364d1d99` |
| image archive SHA256 | `ef06f7c855852e4d51f35613c1485c5b43dd2758917e1d8bef63763a8629f175` |
| 3200／HTTPS β build | `RTmRnpoWCYnN5rgv2CLlz`（同じapp source） |

最終image内の会員36／知識9 SQLは、実物復元検証をした12273b17と全checksum一致。全layer／config／manifest／sourceラベルを照合した。正式用runtimeは別DB・別role・正式originと新規配送資格を使い、βのDBや会員や試験themeを持ち込まない。Google認証等の旧Web設定、本線KGのops／Neo4j定義とvolume／networkは一致した。PGは30→60接続へ調整し、新常駐はpublisher／review／patrolの3つ。資料取得／読解の2 WorkerはPCから正式HTTPS APIへ接続する。

βを100回／日へ切り替え、使用済み5回／日・412回／月とprovider待機状態は不変。他15 private設定を保全した。正式は300回／日とし、月次・token・速度も合意配分。既存台帳を0へ戻していない。

最初のβ buildをTurbopack既定で作ったため、配置先移動後にpgの外部module名を解決できず認証APIが失敗した。担当の配置不備として記録する。動作済みbuildへ戻し、従来と同じwebpackで作り直して再配置した。最終APIはmember/status 200、auth/get-session 200、私有Capsuleは未認証401、theme-home 200。実ChromeのGoogleセッション継続・既存草稿の表示と案内文をPC／390pxで確認し、390pxのpage幅380pxで横あふれなし。追加の投稿・AI送信は行っていない。

`scripts/release-knowledge-production.py`は、固定資材と監査時の稼働構成を再照合し、最新backup後に追加16／9 migration・初回の空投影・Web／3 Worker切替を行う。旧34表の行・構造・所有者、本線Entity数とAI artifact／認証設定の保持を照合する。archiveの許可ファイル・経路逸脱拒否、Compose／profile schema、正式origin、SQL checksumを確認した。新形式を書いた後の旧Webへの自動downgrade・旧dumpの上書き復元は行わない。

**本番の正式切替は未実施。** R6bでは既存sudo入力後、正式Google・実テーマ作成・投稿／訂正・Capsule／同URL共有・OGP・PC Worker・同じChatGPT会話の正式API接続を確認する。管理者の毎回承認や全件AI完了を条件に追加しない。

PC Worker再開用launcherも追加した。既存β起動時の復帰へ接続し、正式profile未設置時は既存動作を維持。実際のprivate候補でローカル検査とβ endpoint拒否を確認し、API／AI送信0・process起動0。正式profileの設置と実接続はR6bで切替後に行う。


## R6b切替前の端末修正

本人の最初の切替実行は、PC helperが /dev/tty を開く時点でENXIOとなり終了した。SSH／sudo／VPSの切替scriptは未実行。正式dataset APIは200、新しい知識theme-home APIは404で従来版を継続している。

原因はAutopilot guardのstart_new_session=Trueにより、子に制御端末がないこと。共有ロックの分離・権限・host鍵検証は変更せず、scripts/production_ssh_terminal.pyで標準入出力を継承し、ssh -ttで遠隔PTYを確保する。privateなrun-release.py／run-preparation.pyから同じ実装を呼ぶ。本番image・build・SQL・runtime archiveとSHA256 anchorは変更していない。

実SSHの非特権probeで、制御端末なし＋pipe入力と、制御端末なし＋継承PTY入力を確認。後者では非機密の固定文字列をgetpassへ渡し、入力が画面へechoされず成功した。sudoやDB／Web操作は行っていない。公開本体の再buildは不要。R6bは修正版helperのsudo実行と正式確認が引き続き残る。
