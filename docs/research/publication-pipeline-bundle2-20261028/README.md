# 公開パイプライン改善・まとまり2

**2026-10-28：固定更新判断票への承認に基づきmain／3200／beta／本番Web／VPS gate・operator／WSL delivery・approver／Windows Task／固定Worker 5ファイルへの反映と実検証が完了。** [最終報告・現在地](rollout/COMPLETED.md)／[機械記録](rollout/final-verification.json)。追加の運営者操作はない。データ受入・公開署名・KG apply/restore・会員migration・鍵／権限変更は行っていない。

以下は初回実装・隔離検証時点の説明と承認前の境界記録。現在の設置状況は上記完了報告を優先する。

実装・隔離検証の結果。main `129c1eb411cece336cce02996c520f8f21b12f0a` からの専用branchであり、main統合・設置・正式受入・公開を行った記録ではない。承認契約・ロック構造の全面変更は含めない。

## 1. 完了範囲と現在の境界

|対象|今回の結果|反映先|
|---|---|---|
|Role正本→静的生成|ID、日英表示、定義hash、schema/scope/保存形式の互換情報を生成。CIで生成差分を拒否|専用branch・候補image|
|公開前互換検証|同じ候補bytesをWeb/operator/Workerで検証し、実行版・語彙・定義hash・scope等を固定。署名案内直前にも実状態と照合|専用branch・隔離環境|
|候補生成|schema順JSON、現在のoperator pin、mount内scratch、固定Node、検証証跡の再利用|専用branch・隔離環境|
|状態診断|未署名、署名済み配送待ち、結果不明、公開済み終了処理待ち、完了、失敗を区別|専用branch。過去2 nonceを読取診断済み|
|映画manifest|先行成果を移植し、公開36件を除外した次集合・保留集合を保持|専用branch・隔離環境|
|固定更新資材|ソース、2 image、Worker 5ファイル、gate 2ファイル、設定差分の候補を固定するCLI|私有資材。適用承認なし|
|本番VPSの保護設定の新規実測|運営者が固定exporterを実行。11プログラムhash・現在operator・実Web image・Node・revisionの一致を照合済み|[新規実測と照合](results/vps-inventory-verification.json)|

本番・beta・3200・稼働Worker・会員DB・公開KGは更新していない。設置時の管理者権限、Windowsタスク更新、個別公開署名をこの作業で取得・代行していない。現在の固定判断対象は [UPDATE_REVIEW.md](UPDATE_REVIEW.md)。読取結果待ちは解消し、次は固定更新一式に対する運営者判断となる。

## 2. 実装と既存契約への接続

### Roleの正本と生成

`catalog.json` / `reviews.json` / `baseline-v1.json` のbytesは変更していない。`codegen.json` は旧8 Roleの既存英語表示と過去のexport互換用cohortを保持する補助定義であり、意味承認ではない。旧表示、列挙順、closed enum、ISBN scope、保存version 1/2/3、段別Role検索は維持する。

`npm run roles:generate` が `lib/generated/contribution-roles.ts` と `generated-compatibility.json` を生成し、`npm run vocabulary:check` / CI / Docker build が `roles:check` で変更漏れを拒否する。未承認の第11 Roleはparse可能に生成しても語彙検査が失敗し、adoptedDefinitionHashesへ採用しないことを試験した。動的Role読込は導入していない。

### 同一候補と実行版の照合

`release/compatibility.json` はdata/manifest bytes、schema、serialization、必要Roleの定義hash、catalog/reviews/表示生成定義、scope、保存形式を束縛する。既存ARTIFACT封印へ追加し、既存request/署名のartifact hashに間接的に束縛する。古い封印・receipt・requestは再直列化しない。

`scripts/publication-compatibility.py` は、root statusの現在のoperator digestと実Web container image、固定image ID/platform、Worker Node実ファイルhash・ソースhash、稼働Webのbuild IDと能力情報を照合する。rootの読取検査は既存composeのWeb labelと3200 bindingから一意のcontainerを選ぶ。metadataだけから実imageを推測しない。3利用側のCLIは同じreleaseを読み、同じcontractを返す必要がある。旧requestのdigestは新候補の実行版選択に使用しない。

Webの読取専用 `/api/publication/compatibility` とimage内のbundle CLIは同じ能力を返す。既存Webはこのendpointを持たないため、新しい準備を有効化する前にWebの承認済み更新が必要。稼働Webの能力を取得できない場合は署名案内を出さない。

新規preparationは固定互換policy必須。候補作成前と署名案内前に確認する。image/Node/code/build/candidate/policyが同一なら封印済み検証結果を再利用するが、identityとWeb能力は毎回読取り直す。根拠・base・receipt driftの既存検査は省略しない。旧署名済みjobの同nonce配送は従来経路を維持する。

### bytesと実行環境

fixture v4のZod schema順にJSON 2-space + LFで直列化し、parse前後の値・fieldsが同じことを検査する。未知fieldを落として成功させない。新しい公開projectionだけでこの直列化を使い、古い受入票・manifestのhashを変更しない。

候補のtemporary directoryは既存Docker mount内のpreparation scratchに限定する。hostに未固定Nodeを探索させず、検証済みoperator image内のNodeを使う。Workerは実運用の `home/bin/node` のbytesを固定する。今回の3利用側はいずれもNode `v24.21.0`。開発用VitestのNode `v24.15.0`とは区別する。

imageはタグではなくconfig IDでsaveし、archive SHAとOCI manifest IDの対応を固定する。VPSでloadしたときのOCI IDとWSLのconfig IDの違いを明示する。同じarchiveを再利用し、配備先で再buildしない。

### 状態診断と保護approver

`publication-delivery.py --diagnose` はjobとroot状態、署名、release/artifact/revision、終了証跡を照合する読取操作。新nonce・再署名・applyを許可する機能ではない。公開済み・終了処理待ちでは既存deliveryの同nonce終了処理へ案内する。結果不明・不一致は停止する。

保護approverの更新候補は、子処理のreturn code・例外位置・bounded stdout/stderrをroot専用診断へ保存し、失敗後に `--diagnose` だけを実行する。完了証跡が一致した場合のみ「完了」と表示する。秘密値らしい行は伏字化し、引数・locals・鍵入力を記録しない。正常な公開署名のTTY入力・固定request・鍵分離は変更しない。保護ファイルは未設置。

## 3. 実測・検証

|検証|結果・根拠|
|---|---|
|Role・保存・検索回帰|Vitest 6ファイル96件成功。生成差分、新Role未採用、旧表示、ISBN scope、旧保存形式を含む|
|gate/配送/準備/診断|Python 74件。通常実行でskipしたimage指定1件も、固定imageと実公開fixtureを指定した個別実行で成功。再開、署名後結果不明、二重apply、base drift、stream attestation、fsync失敗、契約欠落と実Web image不一致の拒否を含む|
|映画manifest/受入sequence|Python 30件成功。旧比較guard、ISBN変更・意味変更の再判断、根拠改竄、再受入拒否を含む|
|型・ビルド|Next Webとoperator Docker build成功、TypeScript/変更TSのlint成功。語彙10 Role/0 error、既存warning保持|
|実公開bytes|data SHA `908e6f3cc180a004d53cb5a34937daa8ca3ff539788dc35ffd56e496eca12f1b`。1931 Claim、うち映画36 Claim。元data/manifest bytes保持|
|全利用側|同一の実公開dataと隔離manifestを3利用側が検証。実設置Workerのコード写し＋提案5ファイルで再実測。全10 Roleを必要とする累積baseで成功|
|未知Role|同じ公開dataの私有コピーの1 Roleを未知IDに置換し、Web/operator/Workerすべてexit 1で拒否|
|Worker実工程|実設置コードの私有shadow＋5ファイル、実Node、全12 receipt、映画36件入りbase、旧漫画依頼でcollect-review→受入準備→offline plan成功。1 Entity/Claim/Source/Citation、既存更新0、通信0、正式受入0|
|DB・Web実証|tmpfsの専用Neo4jに同じ実公開dataを適用・検証。古いrevisionと二重applyを拒否。既存Web imageの写しと候補Webで映画36件すべての根拠をAPI確認|
|実ブラウザ|隔離3296のみ。Inception→Christopher Nolan→InterstellarのDIRECTING→SCRIPT_WRITING、Warner根拠、Graph 3 node/2 edge、保存→別探索→復元→reload成功|
|実エラー照合|過去2回のgeneric errorのnonceをrootへ読取照合し、両方completed・追加操作不要と判定。再署名・applyなし|

詳細は [results](results/)。`real-consumers.json` はDB/ブラウザ実証、`all-consumer-proof.json` は最後に実設置Worker shadowで取り直した3利用側の能力証跡。`worker-workflow.json` は実設置ソースを用いた工程実証。その後、運営者から新規VPS実測を受領し、過去設置記録とgate全11ファイル・現在operator・実Web imageの一致を `vps-inventory-verification.json` で確認した。既存Webの隔離検証には、その設置imageと対応するWSL側imageを使用していた。新しい候補版の本番設置・本番での全利用側preflightは未実施。

`installed-local-inventory.json` / `verification.json` 等の初回記録にあるVPS確認待ちは当時の状態として保持し、後から書き換えない。現在の確認結果と固定資材は `vps-inventory-verification.json` / `update-assets-vps-confirmed.json` を参照する。追加で、既存Web imageの写しと候補Webの初期AI artifact hashが同一であることも確認した（`web-artifact-preservation.json`）。

隔離manifestは公開release IDを改名した試験専用であり、12件目のreceiptを新規受入したものではない。Webの会員storageを無効化した私有containerだけを使用した。

試験中の手戻り：空DBのbackup前提、Docker internal networkからのloopback公開不可を隔離harnessで修正した。KG networkはinternalのまま、Webだけ専用UI bridgeへ接続。最終container/networkは削除済み。imageは開発中3回buildしたが、最終image以後は検証時に再buildしていない。最初のWorker測定で開発用Nodeを使ったため、実設置Nodeと実ソースshadowで該当検証を取り直した。重複した試験回数を成功件数へ加算していない。

## 4. 再利用した成果

|設置元・固定commit|再利用内容|
|---|---|
|Issue33設置コード `7392d8e343a11644b1047364c71653779ad0c93c`|mainにないpreparation/delivery/artifact plan、build_candidate、bounded lock待機・stream attestationを固定元から移植。古いmainで上書きしない|
|保護approver設置元 `908c8e498b7163432472ea5873a8e122be8d8df0`|既存TTY署名/uid分離のentryを再利用し診断だけ追加|
|映画専用成果 `ccab51a6` / Worker承認元 `089ee519`|候補manifest、映画dispatch、受入接続、全件台帳、実Worker工程probe。branch全体はmergeしない|
|Astra設計レビュー `8380f312`|coverage-planを読取入力として再利用。過去の完了数・時間推定は新規実測の代用にしない|

## 5. 次回から消せる作業と残る判断

|場面|削減する機械作業・往復|残る作業|
|---|---|---|
|共通形式の新Role|利用側ごとのID/表示/hashの手更新を1回の生成へ。漏れをCI・全利用側検証で署名前に検出|意味・scopeの正式判断、生成差分レビュー、新しい固定版の承認・配備|
|既存Roleのデータ追加|同じ検証済みimage/Nodeを再利用。再build、環境ごとのbytes再生成、旧requestからのdigest探索を不要にする|新根拠・同一性・正式受入、最新base/receipt照合、個別公開署名|
|公開後generic error|実際に起きた2回の「成功か失敗か再調査」を同nonce状態診断に置換。完了時の再署名相談を不要にする|証跡不一致・通信断時は運営者確認。自動再applyしない|
|中断後再開|候補hash・policy・実行版が同一なら既存証跡を再利用。stagingを同nonceで再開|base/receipt/image/コードが変われば再検証・必要な固定判断|
|候補一括準備|映画3作品/2 Claim固定adapterを増設せずmanifestで集合と保留を保持|各候補の根拠・意味・同一性の不足解消|

回数を無根拠に「常に1往復」とはしない。この更新を承認・設置後、通常の既存Role追加は、受入判断までの準備と正式受入後の署名待ち準備を機械処理で進め、意味/同一性を含む受入判断と個別公開署名を残す。互換不一致やbytes差、成功後generic errorを理由とした追加の指示を減らす。新Roleの版更新承認は今回も必要で、構造の新設は別設計となる。

## 6. 未収録成果を止めない

124候補・97 Entity候補を保存し、公開済み36 Claim/32正式Entityを除いた照合済み45記録/65 Entity候補を追跡する。45件の内訳はA/B 29件、C 12件、D 4件。さらに構造化のみ37候補・研究保留6候補を削除しない。

今回のsaved資料による次manifest監査はA/B 29件を全件点検し、提出可能0、根拠補完28、同一性判断1。根拠の見出し未転記を不存在とはしていない。保存済み人物creditは残し、狭いACTINGの演技文脈や脚本/製作の個別対応等に不足する確認を理由コードで保持する。C/Dは新Role意味・関係構造の判断対象。全124候補の台帳と除外36件を [remaining-film-candidates.json](results/remaining-film-candidates.json) と入力coverageで突合できる。

この基盤更新は追加根拠の確認・判断票作成の前提ではない。旧運用でも、保存資料を使って不足を解消し、採用可能になった集合だけをmanifestで受入準備できる。全45件が揃うまで公開を止める条件は追加しない。新基盤での公開前検証を利用する場合だけ、承認済み設置が必要となる。

## 7. 再実行と復旧

`READONLY_INVENTORY.md`、[UPDATE_REVIEW.md](UPDATE_REVIEW.md)、[RECOVERY.md](RECOVERY.md) を参照。秘密値を含むscratch・image archive・診断原本は `.local/publication-pipeline/` に置きGitへ入れない。画面・機能の候補は隔離で検証しており、未受入branchを3200/betaへ直接配置しない。
