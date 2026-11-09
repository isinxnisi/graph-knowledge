# 年表の見出し・時期の文章まで含めた多言語の是正

2026-11-09。固定UIだけを直し、画面に残る年表見出し・時期ラベルの翻訳対象不足を後回しにした区切りは不適切だった。今回はそれらを登録・確認・公開・表示まで同じ経路へ接続する。

## 実装

- 原本の内容版と安定timeId／axisIdに束縛し、存在する時期ラベル、周期／定性の軸名・単位・段階の意味・開始終了の段階名、年表見出し・軸の説明・子軸見出しを既存の訳文対象へ追加した。日付・数値・比較順序のキー・原資料表記／引用は書き換えない。
- `read_theme.translationTargets`が存在する項目と原文を列挙する。Chat向けguide/schemaと一般の訳文投稿パネルの両方から使える。新しい権限・収集計画・運営画面操作は不要。
- 年表・詳細・Capsuleは登録済みの訳文を表示へ利用する。scopeも取得だけで表示へ使っていなかった漏れを修正。定性の座標は描画計算には原文、画面には訳文を使い、年代・包含・所属・並び順を変えない。
- 古い訳文のidentityと版は保持。新selectorのある対象だけ識別子を追加し、同じ文章を持つ別注釈を混同しない。原文hashと内容版の一致、現公開範囲、寄与者、通知、利用量、同値性確認は共用する。Capsuleは保存時の断面を保持し、翻訳が増えても勝手に最新へ置換しない。
- 読込中、分割境目のラベル・操作説明も表示言語へ接続した。テーマ表示時のsnapshotへ原Theme参照を渡し、軸の訳文を解決できるようにした。

## 検証

対象64件（selectorの組合せ・旧identityの維持・原文／日付／段階順序・版違い／独自ラベル・保存済みCapsule・実描画部品を含む）と変更対象lintに成功。隔離PostgreSQLで既存の訳文受付・再送・取消・寄与者・公開停止と、追加した見出し／時期ラベルの通常確認→公開を含む8件に成功。関連schema／MCPを合わせた実行bundleは19件。AI応答はこのDB検証ではfixtureで、実AIとは区別する。型検査込みbeta／formal buildを完了。

HTTPS βの本人Googleログインで、Theme構成版5の翻訳パネル→年表見出し→草稿→送信→通常のGemini確認→公開まで実操作した。英訳`From deployment to orbit insertion`を同じ年表で表示し、390×844で横はみ出しなし。最後に通常viewportへ復帰。証跡は開発PC `C:/Users/nishr/.codex/tmp/timeline-text-beta-20261109.png`。実iPhone端末自体では未確認。

正式Theme構成版6は、接続済み正式MCPで原本を取得し、未訳のscope6件を既存APIから提出して全件の通常公開を確認。既に訳文があった6件は再投稿しない。残る年表見出し1・時期ラベル8の正確な原本参照と訳文は開発PCのprivate backupに保存した。新APIの本番配置後に通常経路で提出し、同じ正式年表の表示まで確認する。現時点でこの9件の公開完了とは扱わない。

## 配置・再開

- app `a5b82aae26e9d9f200b8e6b311a4a949bc81d973`。localhost3200／HTTPS β build `1ZiD7iwB_PfTU1c2DCBLR`へ検証済みmainから反映。private設定14件・会員39／知識8 migration checksumは保持。新selectorを処理するβのreview／patrol／publisherだけを再起動し、収集・readerは維持した。再開launcherの既存port拒否後、公開済み起動関数で3 Workerの復帰を確認した。前buildはignored backups/timeline-text-20261109/beta-next-previousへ保持。
- 正式候補build `vdygDVSqogk2drMutfW3U`、Web tag `plunode-web:timeline-text-a5b82aae`、manifest `sha256:fda493ddf86db52e02fda4f7913e983029bd4ebcb5de839685fd896faccf1ce6`。Worker tag `plunode-knowledge-ops:timeline-text-a5b82aae`、manifest `sha256:5b6645dfbafc92f0bb4b6768219d1e4079b64edc5a86bde36eb05944590d5880`。
- 正式Webのstandalone起動・robots HTTP200・build一致、Worker imageで新selectorの読取、archiveのconfig／manifest／全layer／source照合・転送先checksumを確認。適用済みmigrationは変更せず、追加migrationなし。
- **本番のruntimeはまだ7e0030a6／KueewANztR3-wx0mBDHhb**。runner `/home/isinxnisi/1.projects/7.graph-knowledge/backups/timeline-text-20261109/run-release.py`を本人sudoで実行すると、現行Web・Worker image、私有設定hash、会員39／知識9 checksumを照合し、構成backup後にWebと3 Workerのみ更新する。OS／KG／AI公開artifact・認証設定は保持する。
- 新しいtarget JSONを旧binaryが読めない可能性があるため、切替後の失敗に旧Webへの機械的downgradeやDB dump上書きは使わない。新しい互換runtimeを維持して補修する。切替後の9訳文の通常公開と正式実画面確認が残る。これは将来課題へ回す区切りではなく、sudo実行後にこの作業のまま続ける再開点。
