# 年表の見出し・時期の文章まで含めた多言語の是正

2026-11-09。固定UIだけを直し、画面に残る年表見出し・時期ラベルの翻訳対象不足を後回しにした区切りは不適切だった。今回はそれらを登録・確認・公開・表示まで同じ経路へ接続する。

## 完了結果

①不足整理・②実装と検証・③localhost／HTTPS β／本番反映・訳文公開・正式画面確認を完了した。app `a5b82aae`、正式build `vdygDVSqogk2drMutfW3U`。本番切替手順の補修は`6270664b`。

- 本人の再開runner実行後、正式hostのHTTP200と対象build、VPSの`activated.json`を照合。2026-11-09T03:21:13Zのbackupは`/opt/graph-knowledge/backups/timeline-text-runtime-20261109T032113Z`。Webと3常駐Workerを更新し、共用のmember-ops／knowledge-opsを含む5つのoperator image参照を同じ資材に揃えた。会員39／知識9 migration checksum、設定、KG、AI公開artifactは保持。追加migration・DB復元・OS更新なし。
- 既存の正式Appが古い引数schemaを保持しており、新しいaxisId／timeIdが送信前に拒否された。ChatGPTの既存App設定で「ツールを更新」を実行し、権限・接続先・App IDは維持した。更新後、同じ接続済みMCPから9対象の原文・期待版0を再読取し、保存したrequestId／payloadで各1件を提出した。
- 年表見出し1件・時期ラベル8件は通常のGemini確認を各1回で通り、9件とも`published`かつ訳文版1。順番待ちは既存の送信枠の自動再開で処理し、手動受理・枠迂回・再投稿はしなかった。見出しのrequestIdは`7fee9abb-35a8-490c-bb84-a2cd014f3a42`、指摘された検討会ラベルは`1a8d2ed8-1773-4621-b7c5-062711c0c965`。全receipt・publication ID・payloadはignored `backups/timeline-text-20261109-r2/translation-{submissions,publications}.json`へ保持。
- 公開後の正式Theme版6・12 Record・4 Entity・7 Source・timelineを再取得し、提出前の原本snapshotと全体一致。訳文のために原文や日付・構成版を変更していない。
- 正式英語URLをPCと390×844の実Chromeで確認。見出しが`From concept and development to launch and sunshield deployment`、指摘箇所が`1989-09 · Next Generation Space Telescope workshop`となり、他7時期ラベル・期間の終了表示・詳細補足も公開訳文を使用。Theme reading内に対象9か所の日本語残留なし、横はみ出しなし。viewportは確認後に解除した。証跡は開発PC `C:/Users/nishr/.codex/tmp/timeline-text-formal-pc-20261109.png` と `timeline-text-formal-mobile-20261109.png`。
- localhost3200／HTTPS βもHTTP200・beta build `1ZiD7iwB_PfTU1c2DCBLR`を再確認。βの実Google投稿→見出し訳文公開・描画確認は下記を活用し、文書追記だけで不要な再buildは行わない。

確認先：<https://plunode.net/en?ktheme=theme%3A915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1&krev=6&kview=split>。既に開いている画面は再読込して確認する。既存Capsuleは固定した訳文の断面を維持するため、最新訳を取り込む場合は従来の取得元更新・明示保存／共有反映を使う。今回の通常Theme表示と混同しない。実iPhone実機の再確認と、他テーマの未登録文章を含む全件翻訳を行った意味ではない。

## 本番切替の事前照合を補修

初回の本人sudo実行は、operator imageを参照するサービス名のassertionで停止した。本番の既存構成は`member-ops`・`knowledge-ops`・review・patrol・publisherの5参照だが、手順が`member-ops`を数えず4参照だけを期待していた。停止・Compose切替・DB操作より前の失敗で、従来Web／Workerを維持した。image読込と候補ファイル作成までは実行された。

実物の既存Composeのサービス／image参照を再確認し、5参照を明示allowlistで照合してから各サービスのimage行だけを変更するよう補修。別のKG用`ops`や環境設定・command等の変更は引き続き拒否する。既存5参照、欠落、想定外の追加参照、5行だけの書換えの回帰4件が成功。アプリa5b82aae／build／imageは再作成せず同じ資材を使う。失敗stageを保持し、別の`-r2` stageと再開runnerを用意した。その後の成功結果は上記。

## 実装

- 原本の内容版と安定timeId／axisIdに束縛し、存在する時期ラベル、周期／定性の軸名・単位・段階の意味・開始終了の段階名、年表見出し・軸の説明・子軸見出しを既存の訳文対象へ追加した。日付・数値・比較順序のキー・原資料表記／引用は書き換えない。
- `read_theme.translationTargets`が存在する項目と原文を列挙する。Chat向けguide/schemaと一般の訳文投稿パネルの両方から使える。新しい権限・収集計画・運営画面操作は不要。
- 年表・詳細・Capsuleは登録済みの訳文を表示へ利用する。scopeも取得だけで表示へ使っていなかった漏れを修正。定性の座標は描画計算には原文、画面には訳文を使い、年代・包含・所属・並び順を変えない。
- 古い訳文のidentityと版は保持。新selectorのある対象だけ識別子を追加し、同じ文章を持つ別注釈を混同しない。原文hashと内容版の一致、現公開範囲、寄与者、通知、利用量、同値性確認は共用する。Capsuleは保存時の断面を保持し、翻訳が増えても勝手に最新へ置換しない。
- 読込中、分割境目のラベル・操作説明も表示言語へ接続した。テーマ表示時のsnapshotへ原Theme参照を渡し、軸の訳文を解決できるようにした。

## 検証

対象64件（selectorの組合せ・旧identityの維持・原文／日付／段階順序・版違い／独自ラベル・保存済みCapsule・実描画部品を含む）と変更対象lintに成功。隔離PostgreSQLで既存の訳文受付・再送・取消・寄与者・公開停止と、追加した見出し／時期ラベルの通常確認→公開を含む8件に成功。関連schema／MCPを合わせた実行bundleは19件。AI応答はこのDB検証ではfixtureで、実AIとは区別する。型検査込みbeta／formal buildを完了。

HTTPS βの本人Googleログインで、Theme構成版5の翻訳パネル→年表見出し→草稿→送信→通常のGemini確認→公開まで実操作した。英訳`From deployment to orbit insertion`を同じ年表で表示し、390×844で横はみ出しなし。最後に通常viewportへ復帰。証跡は開発PC `C:/Users/nishr/.codex/tmp/timeline-text-beta-20261109.png`。実iPhone端末自体では未確認。

正式Theme構成版6は、接続済み正式MCPで原本を取得し、未訳のscope6件を既存APIから提出して全件の通常公開を確認。既に訳文があった6件は再投稿しない。年表見出し1・時期ラベル8の正確な原本参照と訳文を開発PCのprivate backupに保存し、新API配置後に通常経路で提出・公開・表示まで確認した。

## 配置・再開

- app `a5b82aae26e9d9f200b8e6b311a4a949bc81d973`。localhost3200／HTTPS β build `1ZiD7iwB_PfTU1c2DCBLR`へ検証済みmainから反映。private設定14件・会員39／知識8 migration checksumは保持。新selectorを処理するβのreview／patrol／publisherだけを再起動し、収集・readerは維持した。再開launcherの既存port拒否後、公開済み起動関数で3 Workerの復帰を確認した。前buildはignored backups/timeline-text-20261109/beta-next-previousへ保持。
- 正式候補build `vdygDVSqogk2drMutfW3U`、Web tag `plunode-web:timeline-text-a5b82aae`、manifest `sha256:fda493ddf86db52e02fda4f7913e983029bd4ebcb5de839685fd896faccf1ce6`。Worker tag `plunode-knowledge-ops:timeline-text-a5b82aae`、manifest `sha256:5b6645dfbafc92f0bb4b6768219d1e4079b64edc5a86bde36eb05944590d5880`。
- 正式Webのstandalone起動・robots HTTP200・build一致、Worker imageで新selectorの読取、archiveのconfig／manifest／全layer／source照合・転送先checksumを確認。適用済みmigrationは変更せず、追加migrationなし。
- 本番runtimeはa5b82aae／vdygDVSqogk2drMutfW3Uへ切替済み。初回失敗runnerは履歴として保持し、本人sudoの成功は `/home/isinxnisi/1.projects/7.graph-knowledge/backups/timeline-text-20261109-r2/run-release.py`。現行Web・Worker image、私有設定hash、会員39／知識9 checksumを照合し、構成backup後にWebと3 Workerを更新した。OS／KG／AI公開artifact・認証設定は保持。
- 新しいtarget JSONを旧binaryが読めない可能性があるため、今後の失敗にも旧Webへの機械的downgradeやDB dump上書きは使わない。新しい互換runtimeを維持して補修する。今回の9訳文の通常公開と正式実画面確認は完了。
