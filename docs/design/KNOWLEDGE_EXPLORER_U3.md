# 通常探索・テーマ・年表の接続 U3

2026-11-02。[U1の共通原記録](KNOWLEDGE_FOUNDATION_U1.md)と[U2の公開読取](KNOWLEDGE_PUBLIC_READ_U2.md)を、独立確認環境の通常Explorerへつなぐ契約。年表はCapsule専用画面ではなく、中央Graph領域の表示方式として扱う。実操作・build・配置SHA・データ照合の結果はU3の検証記録へ残し、この設計書と区別する。

## 読み始める場所と表示方式

入口は `http://localhost:3276/`。既存Explorerの検索・中央Graph・詳細の枠、GraphCanvas、SiteHeaderを利用する。対象を探して周囲の関係を広げる経路に加え、ホームのテーマ候補、テーマ検索、選択対象の「この対象のテーマ」から、その場でテーマを読む。

テーマを開くと同じ中央領域が構成版の読取へ切り替わる。時期情報がある場合は「関係図／年表／並べて読む」を選べる。Themeの初期表示に従い、年表を主役として直接開くこともできる。対象探索を一度経由することや、モーダル・別画面を開くことを前提にしない。テーマを選んでいない通常探索に、使い道のない年表切替を常設しない。

関係図のない年表テーマは年表で読める。時期情報のないテーマには年表切替を出さない。「並べて読む」は同じThemeの関係図と年表を見比べる表現であり、別の年表同士の比較・マージを実装した意味ではない。PCでは横に並べ、狭い画面では縦に並べる。スマホでは検索・Graph・詳細の既存pane切替を用い、常設操作や説明の面積を抑える。

`/themes/explore` はU2の公開読取確認面として残す。U3の主入口や、採用済みのサービス全体の画面構成とは扱わない。今回の接続は `THEME_WORKBENCH_ENABLED` と `KNOWLEDGE_WORKSPACE_ENABLED` を有効にした独立3276環境に限り、main・3200・HTTPS β・本番の探索を置き換えない。

## 時期を持たない情報もテーマの主内容

Themeの見出しに続き、表示切替の近くへ「テーマの情報」を置く。対象は、選ばれた固定Recordのうち `times` が空のものすべて。説明・背景だけでなく、時期が定められていない具体的な関係も含む。関係図・年表・並列のどの表示でも読み、同じ詳細欄で内容と根拠を確認できる。

ここへ置く理由は、時期なし情報がテーマの理解や楽しさを支える内容だからである。架空の日付を与えて年表へ押し込まず、時期未登録というだけで関係図の隅や補助設定へ隠さない。Theme自体の紹介文と、根拠を持つRecordの情報は分ける。紹介文は中央に常設行を足さず、見出しのbook icon「テーマについて」から共通の右詳細へ開く。スマホでは詳細paneで紹介文と構成版を読み、中央見出しの構成版文字は省く。

初期表示はPCで先頭2件、スマホで先頭1件。具体文を各1行で示し、収まらない末尾を省略する。残りは見出し右の「ほかn件」から開き、関係の両端と具体語・根拠数・内容版などのmetadataは展開時だけ表示する。否定・不確実は折りたたみ中も残し、短く見せるために意味を変えない。各行を選ぶと、省略前の本文・範囲・資料を共通詳細で読める。

図の前に補助要素が積み重ならないよう、Contextは小さい見出しと行にまとめる。展開時もContext専用のmax-heightやスクロール領域を増やさず、中央の内容として自然に続けて読む。Theme見出しは一行を基本にした小さいsticky headerとし、タイトルが長い場合は省略して「探索に戻る」を残す。 年表外側の二重のpadding・borderも置かず、線と記録に使える幅を確保する。

| Recordの内容 | 関係図 | 年表 | テーマの情報 |
| --- | --- | --- | --- |
| 時期付きの関係 | 明示された両端と具体語の辺 | 同じRecordの時間注釈 | 通常は重複させない |
| 時期なしの関係 | 明示された両端と具体語の辺 | 架空の時期を付けない | 内容と根拠へ進める |
| 時期付きの出来事・説明・期間 | 架空の辺や期間Entityを作らない | 時点・期間・幅など元の意味で表示 | 通常は重複させない |
| 時期なしの出来事・説明 | 架空Entityを作らない | 通常は表示しない | 内容として読む |

`KnowledgeTimeline` の `untimedInContext` が重複を抑える。例外として、明示insetの親になっている時期なしRecordは、子の年表へ進む入口を失わないため年表にも残す。日時の重なりから親子・所属・因果を推測しない。

## 元の探索とテーマの固定版を分ける

通常探索はU2の公開世代IDと、その世代のRecord・Entityを読む。Themeは保存した構成版から、Record・Entity・Source・Mappingのpinを解決する。Themeの根拠欄に最新世代の同名RecordやSourceを差し込まない。資料はEvidenceの `source.id@revision` が引用先であり、固定版にその資料がなければ新しい版で補完しない。

`useKnowledgeWorkspace` は通常探索とThemeのGraph state、選択、配置を別に持つ。Themeを読む間も通常Graphを隠して保持し、「探索に戻る」で元の起点・展開済み関係・選択・位置へ戻れる。Theme内の対象からさらに探索したい場合は、「この対象から探索する」という明示操作で通常探索へ移る。これはThemeの固定版へ最新の周辺関係を暗黙追加する操作ではない。

関係図と年表の選択は安定Record IDを共有し、そのTheme内の同じ内容版・根拠を詳細欄へ渡す。年表の関係行には両端の対象と具体的な関係語を示す。図へのボタンはrelation Recordだけに出し、PCでは並列、スマホでは関係図を表示して対応箇所を見つける。

公開世代の更新は通知し、「最新版を読む」で進む。Themeの固定版を読んでいる間は、その内容に作用しない通常探索の新世代通知を出さず、通常探索へ戻った時に表示する。Themeも明示して構成版を読み直す。内容の更新と現在の閲覧可否は別であり、公開停止されたRecord・Entity・Source・Themeを旧版やブラウザ履歴から再表示しない。Themeに必要な固定参照が閲覧不可なら、部分的な年表を成功扱いせず、そのThemeを読めない状態にする。

statusの変更tokenを定期確認し、同じ世代・同じTheme版の閲覧可否を再検査する。既知の停止は別の検索要求の失敗・待ちに引きずらず反映する。遅れて返った検索・復元応答で、利用者が先へ進めた選択を巻き戻さない。

## 戻る・再読込・入力の再開

ブラウザhistoryとこのタブのsessionStorageには参照・表示状態を保存する。通常探索のquery・分類、世代、起点、表示Record ID、選択、Graph位置・pan・zoom、Theme ID・構成版・表示方式・選択・Graph位置を分けて保持する。内容本文のキャッシュを復元の正本にせず、戻る／再読込時は固定参照を通常APIから読み直し、現在の閲覧可否を検査する。

Themeを開くURLには `ktheme`、`krev`、`kview` を持たせる。これは確認環境内の読取位置であり、会員Capsuleの共有URL発行や公開範囲の変更ではない。

同じ画面での表示切替ではGraphを再生成せず、年表の展開・表示単位も維持する。元探索へ戻る際の中央／詳細スクロールとスマホpaneはメモリ上で戻す。全検索条件や年表の細かな表示状態を再読込後まで保存できるとはしない。現段階でrecord検索の役割／ISBN・検索種別、年表の展開・表示単位、スクロールはsession保存の対象外である。

スクロールは年表内で縦の操作を閉じ込めない。年表paneは `overscroll-behavior: contain auto` とし、横方向の連鎖を抑えながら、縦は年表の端から中央、documentへ続ける。既存Explorerの中央・左右paneも縦方向を `auto` とする。単独年表とスマホでは年表の高さ上限を外し、並列PC表示では読みやすい高さの年表paneを使う。GraphCanvas固有のzoom操作は維持し、年表を読むためのスクロール変更をGraphの拡大縮小へ混ぜない。

`/themes/records` の新規Record入力とRecord訂正は、入力値・新規ID・明示再利用したEntity／Sourceの観測版・訂正元Record版・送信request IDをタブ内に保持する。探索へ戻った後や再読込後に「入力を再開」できる。閉じることと破棄を分け、成功時または明示破棄で草稿を消す。保存できた後の一覧再読込だけが失敗した場合も、未保存と誤表示しない。

同じ内容の再送は同じrequest IDで照合する。訂正途中に原記録が変わった場合は古い期待版を409で拒否し、草稿を保持する。最新内容へ自動で基準を付け替えて再送しない。固定Themeから訂正へ入る場合は、読んでいた版と編集対象の現行版の違いを表示する。

入力UIは現段階では一つの根拠と暦の時点／期間、Recordの具体文・関係語の訂正、対象名の訂正を扱う。APIが保持できる複数根拠・複数時間・周期・定性を、すべて画面で編集可能とはしない。Entity名訂正フォームやTheme作成タイトルは、Record草稿と同じ再開機構の対象ではない。

## 年表rendererの再利用とデータ契約

既存 `ThemeTimeline`／`CalendarTimelineGraph` と暦の線・期間・点化の計算を再利用し、保存用の旧ThemeRecordから描画用 `TimelineDisplayRecord` を分離した。旧ThemeTimelineの入力・訂正・選択callbackは維持する。

U3の `KnowledgeTimeline` は表示設定をnative `details` へまとめ、初期状態では折りたたむ。変更した表示単位・たどる対象は閉じたsummaryにも残し、設定が効いていることを分かるようにする。「線の見方」も必要時に開く。これはU3から `compactControls` を渡した場合の配置であり、旧ThemeTimelineの既定表示や時間注釈の意味は変更しない。

- U1のRecordは複数の `times` を持つ。一つの時間注釈につき描画rowを作り、row IDにはRecord ID・内容版・time IDを含める。Recordそのものを複製しない。
- 注釈のないRecordは時期なしrowとして扱える。nullable subject、URLなしの書誌、空のexcerptを認め、架空の対象・URL・引用文へ変換しない。
- 複数rowの選択は同じRecordへ戻す。一つのrowを開くときはそのrowの内容を開き、同一Recordの他の線にも選択対応が分かるようにする。
- Sourceは固定pinで解決し、資料版・書誌・locator・excerpt・stanceを保持する。内容が新しい資料へ勝手に差し替わったように見せない。
- 描画用axis IDを名前空間化し、Common IDが許容する文字列と旧rendererのfallback内部キーを衝突させない。
- 明示軸では周期長・単位、定性座標の意味と順序を揃える。参照、重複、inset循環、既存の最大3段を検証する。未配置の注釈は互換なfallback軸へ表示し、捨てない。

insetの親指定は現在Record単位であり、特定time IDへの指定ではない。複数時間を持つ親の場合は、子軸とその子孫の外側にある親rowを優先し、そのうち最初のrowに子軸を一度だけ接続する。これは描画上の入口の選択であり、「子の出来事がその時間注釈の期間に所属する」という意味を追加しない。特定注釈への親指定が必要なら、後続で明示 `parentTimeId` の契約を検討する。

## 共通読取APIと操作主体

読取は `/api/knowledge/public` の `entities`、`themes`、`theme` を追加し、既存のsearch／record／graph／neighbors／paths／facets／statusと接続する。Entity検索は公開世代と全条件をcursorへ結び付ける。Theme一覧・固定版読取はPGのpinを解決し、公開依存先の現在の可否を確認する。Theme本文をactive世代へ再解決しない。

`public` は公開可否の契約を使う読取という意味であり、この段階で外部公開APIを開放した意味ではない。確認APIにはHost／Origin・専用runtime・DBのguardがあり、no-store／noindexを維持する。

新規登録・訂正・観測移入は既存の `/api/knowledge` コマンドを使う。この確認面のactorはサーバーがlocal operatorに固定する。入力本文でoperator／collectorへ切り替えない。確認状態と公開状態も混同せず、移入やSourceの再利用だけで資料を「確認済み」にしない。

一般利用者の知識投稿は受付・AIチェック・審査中・修正依頼・結果通知を残すU5へ接続する。運営指定の有限収集はU6であり、通常分を毎回の管理者承認へ戻さない。この二つの入口方針を、共通Record APIを利用する都合で一律にしない。U3からAI呼出・収集Workerを開始しない。

## 現行テーマを壊さず共通基盤へ移入する

`prepareThemeKnowledgeImport` と `scripts/import-theme-knowledge.ts` は、実際の旧 `/api/themes?theme=ID` が返すThemeDetailを観測してから、新規common objectsと固定Themeを作る。配布JSONを現在の編集済みテーマへ上書きしない。テーマ専用の条件分岐は置かない。

今回の対象はWebb展開の現行版1・11記録と、Webb国際協力の現行版5・6記録。後者は配布JSONの5記録から編集されていたため、現行6記録を固定して取り込む。namespaceは `u3`。同じ対象へ接続する3 Entityだけを明示bindingsで再利用し、同名による自動mergeは行わない。Picassoの既存関係の意味を再解釈する移入は今回行わない。

旧側の16 Theme・18 Capsule・9共有を維持し、新規保存は `knowledge75` へ行う。新しい共通RecordやThemeの版は1から始まり、旧Theme内容版5という由来を原本に保持する。旧Capsule・共有断面を新しい読取へ勝手に付け替えない。

観測原本、旧内容版、取得時刻・hashを含むEvidence、元Entityと意味対応をimmutable provenanceへ保存する。Sourceへ再利用するのは資料名・URLのメタ情報であり、別の主張のlocatorやexcerptを共通根拠として配らない。旧Mappingは対応するRecord版が一致するものだけを新Record版1へ引き継ぎ、不一致は原本と警告に残す。

Theme由来の原本は `importKind: theme75` を明示する。旧KGのtyped Claimとは区別し、旧predicate／Role／刊行物scopeのfacetを捏造しない。旧KG由来のtyped限定と訂正時の失効規則はU2の契約を維持する。

WSLで共通holdを保持し、独立worktree内で計画を保存する。既存planは上書きできない。

```sh
.local/issue75/node node_modules/tsx/dist/cli.mjs scripts/import-theme-knowledge.ts \
  --theme webb-deployment-timeline --namespace u3 \
  --plan .local/issue75/u3-webb-deployment.plan.json
```

`--bindings FILE` を付ける場合、JSONは旧Entity IDからcommon `{id, revision}` への明示対応とする。作成したplanには全対応が出るため、次のテーマへ再利用する対象だけを選ぶ。名前だけから作成しない。

適用は観測した同じplanを使う。`HOLD_TOKEN`は実際に保持中の共通ロックtokenとする。

```sh
.local/issue75/node node_modules/tsx/dist/cli.mjs scripts/import-theme-knowledge.ts \
  --apply .local/issue75/u3-webb-deployment.plan.json --token "$HOLD_TOKEN"
```

CLIはlocalhost:3276に限定し、redirectを拒否する。通常APIへcreate-bundle、必要なset-mapping、create-themeを順に送り、各段階の安定request IDで再送できる。bundle単体はtransactionだが、移入全体は一つのtransactionではない。途中失敗時は同じplanで再開し、毎回新しいplanを作って記録を重複させない。原本・計画のhash不一致、API入力上限、既存ID競合は停止する。旧データを削除して解消しない。

## 起動・再開と後続の境界

起動は[U2の「確認環境の起動・再開」](KNOWLEDGE_PUBLIC_READ_U2.md)を引き継ぎ、`python3 scripts/issue75-preview.py status`／`start` を使う。ソース更新時のbuild・再起動は共通hold下で行う。PG・Neo4j・通常publisher・private runtimeを再利用し、volumeや秘密値を作り直さない。U2 publisher稼働中にP0の `knowledge-foundation-proof.ts` を同時実行しない。

U3は独立確認環境での操作経路であり、本番統合完了ではない。 最後の補助UI占有低減とwheelによるスクロール連鎖は実ブラウザ操作が未確認であり、テスト・buildと実操作確認を区別して[U3検証記録](../verification/KNOWLEDGE_EXPLORER_U3_20261102.md)へ残す。

- U4：既存会員Capsuleへcommon origin・固定断面・年表・初期表示を接続する。年表だけの保存共有、同URLの明示更新、旧版コメント、固定コミュニティ掲載、年表OGPを扱う。
- U5：利用者知識投稿の受付・実AI一次チェック・審査中・修正・通知、本人認可と草稿のサーバー保存を接続する。
- U6：有限収集job、Worker、取得・読解・意味整理、予算予約・精算と再送を実証する。
- U7：全量移行・性能・復元と統合受入を行う。旧データの全量変換や既存会員機能との往復を、代表2テーマだけで確認済みにしない。
- U8：別途の公開指示に基づき、確認済み資材の正式配置と運用引継ぎを行う。

年表同士の比較・マージは構想として保持する。別Themeの固定断面を混ぜる際の同一Record・Entity・時期軸・観測版の扱いを明示する必要があり、今回の「並べて読む」の成功だけで実装済みとしない。
