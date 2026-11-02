# U3 通常探索・テーマ・年表の接続確認

2026-11-02。対象は `codex/issue75-theme-foundation` の独立確認環境 `http://localhost:3276/`。U2完了commit `35a141e4` を起点に、[U3設計](../design/KNOWLEDGE_EXPLORER_U3.md)を実装した。main・3200・HTTPS β・VPSへは配置しない。

## 確認先と再開

- 通常探索：<http://localhost:3276/>
- Webb展開：<http://localhost:3276/?ktheme=u3%3Afbaa9ee12f288cfa%3Atheme&krev=1&kview=split>
- Webb国際協力：<http://localhost:3276/?ktheme=u3%3Aa508eb51cfd248dd%3Atheme&krev=1&kview=graph>
- 登録・訂正：<http://localhost:3276/themes/records>

worktree `/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation` で `python3 scripts/issue75-preview.py status`、停止中なら `python3 scripts/issue75-preview.py start`。既存の専用PG・Neo4j・private設定・Node24・buildを再利用する。更新buildは共通hold下で `stop` → `build` → `start`。volumeや認証設定を新しく作らない。

最終buildと稼働状態は末尾に記録する。確認環境には実資料由来と「仮想」と明示した検証記録があり、本番データをこの確認DBへ混ぜていない。

## 実装と判断

通常Explorerの中央Graphを関係図／年表／並列に切り替える。通常探索と固定ThemeのGraph・選択・位置は分け、閉じる際は元の探索へ戻す。Themeを選んでいない通常探索に不要な年表切替を出さない。旧Explorerはflag無効時に維持し、本線の検索・会員をこの段階で置き換えない。

時期なしRecordは、表示方式を問わず見える「テーマの情報」へ置く。図を読む文脈として見つけられ、架空の日付・期間Entityを作らず内容を楽しめるためである。初期PC2件／スマホ1件の1行表示、残りは見出し右から展開する。関係・根拠・版のmetadataは展開時、本文・資料の全文は同じ詳細欄へ。否定／不確実性は初期表示でも保持する。

補助情報の上部占有率を抑えるため、戻る・タイトルを小さいsticky行へまとめ、Contextのカードと下部toggle余白を削った。紹介文は見出しの本アイコン「テーマについて」から共通詳細欄へ読み、スマホの見出しでは構成版の文字を省く。年表の表示設定はU3だけ初期折りたたみ、変更した単位・対象名は閉じても見える。年表の二重外枠も削った。

Contextを新たな独立scrollにせず、年表paneの縦overscrollをautoとして、終端から中央・documentへ続ける。GraphCanvasのwheel zoom／pan処理は変更しない。通常探索の新世代通知はTheme読取中に押し出さず、通常探索へ戻ったときに示す。

## 実データの観測移入

汎用CLIが現在の旧APIを読み、planを作成して通常の共通登録APIへ適用した。専用テーマ分岐・本番DB直書き・名前による自動mergeは使っていない。

| テーマ | 観測した旧版 | Record | Source | Entity |
| --- | --- | --- | --- | --- |
| Webbが宇宙でひらくまで | 1 | 11（関係5・episode6） | 7 | 新規6 |
| Webbを宇宙へ運んだ国際協力 | 5 | 6 | 3 | 新規3・明示再利用3 |

配布JSONの国際協力は5記録だったが、実環境には利用者編集後の6記録があったため現在の6記録を観測した。元ID・内容版・raw observation/hash・資料ごとの根拠箇所を保持する。再利用はWebb／Ariane 5／L2の観測ID@版を明示し、1件の現行意味対応も引き継いだ。

観測hash：展開 `5ebd3c5d98dd2e66dd68220a309b672aa10a94646b6922f8cded497c851a58bb`、国際協力 `a76da97926c8238fb64b3c9304da475027447d1aa75d31515384325604478fd8`。planと適用結果は `.local/issue75/u3-webb-timeline-plan.json`／`u3-webb-partnership-plan.json` と同名 `.result.json` に保管する。

作業は既存の根拠確認済み記録の再登録であり、新規調査の時間とは数えない。人が行った判断は、テーマの選定・3対象の明示同一性・現行6記録の確認・移入結果の読解。所要分数の実測は行っていない。両テーマ間で独立していた同一打上げ主張は、由来を保った別Recordのままであり自動統合していない。

## テスト・保全

VitestはNode24、最大worker数を抑えて実行した。異なる一時DBを使い、確認用live DBのresetはしない。

| 対象 | 成功件数 |
| --- | ---: |
| 年表描画adapter・移入・既存年表回帰（7 files） | 61 |
| U1 domain／実PG | 22 |
| U2 publication 実PG／Neo4j | 16 |
| U3 reader domain／実PG・Neo4j | 12 |
| Workspace非同期・復元・停止 | 12 |
| 時期なしContext | 8 |
| 新規入力・訂正の草稿UI | 7 |
| 既存ui-state/member-identity/graph-path/theme UI等 | 151 |
| account-settings／ui-locale | 23 |

年表UI14件は最初と既存回帰に重複する。重複を除く成功は **298件**。同じテストを再実行した件数は加算しない。既存ui-stateの3箇所にact環境warningが出るが失敗はない。対象ESLint成功。追加2件はcompact設定を閉じた後の状態保持と既存単独年表の既定controls維持を検証する。

作業前dumpを別DBへ復元し、15表の全既存行の同一性を検証した。旧Theme16／Capsule18／共有9／意味対応4、旧events195／receipts192は完全一致。共通側は新規追加を許した上で既存行の不変を照合し、稼働publication_controlの切替だけを対象外とした。migration ledger2件・適用済checksumも一致し、追加migrationなし。復元先の一時DBは削除済み。

backup `.local/issue75/u3-before.dump`：364082 bytes、SHA256 `a2dc4d476a06d879a91634005cdb30a3d44a21e3e5d2909604148dcbcf96e0a2`。詳細は [u3-preservation-results.json](../research/issue75-foundation/u3-preservation-results.json)。live DBへdumpを戻していない。

## 実ブラウザ確認と限界

Chrome実ブラウザで以下を確認した。

- 通常探索でWebbを検索し、8対象／9関係を表示。Graphを110%へ拡大して関連Themeを開き、中央の年表／並列／関係図を切替。同じ内容版のNASA根拠と関係辺を対応付けて読んだ。
- 元の探索へ戻ると、検索語Webb・110%・選択対象・展開済み関係を保持。登録画面への往復とreload後も復元され、ブラウザBackでThemeの構成版・選択記録を再開した。
- 時期なしの国際協力5記録は、PC初期2件・全展開・同じ右詳細で資料版とMIRI光学系という限定を読めた。compact後のContext高はPC実測68.39px。
- 登録画面で、対象・日付・URLのない架空noteを入力し、探索へ戻る→再訪→入力再開→reload→再開→保存を実行。書誌・根拠箇所・抜粋を保持した。仮想Themeへ構成版1で保存し、原Recordだけを内容版2へ訂正した。
- 390×844のChrome viewportでpane切替と年表の表示を確認。スマホでは説明行と設定2行が最初の記録を押し下げる問題を確認したため、上記の最後の占有低減を行った。

その後、native wheel検証へ移る際、Computer UseがWindowsの現在URLを安全に判定できず、このturnの操作を停止した。別手段でブラウザ制御を迂回しない。**最後の紹介文移動・設定折りたたみ・外枠除去後の実viewport寸法、native wheelの連鎖、iPhone実機は未確認**。これらはコード・DOMテスト・最終buildの範囲を超えて実操作済みとしない。確認用390px viewportの解除と最後の画面キャプチャ保存も、接続停止後は実行していない。

read-only HTTPはGET15回、実2Theme17記録を観測planと照合した。固定pin、具体語、資料版、全時間注釈、年表設定、通常検索／近傍、同一Webbからの両Themeを確認。仮想noteは現行版2、Themeは記録版1・資料版1を維持し、null対象と時期なしも保つ。[HTTP結果](../research/issue75-foundation/u3-http-results.json)と `scripts/verify-knowledge-u3-http.py` に再現手順を残した。

両観測planを同じrequest IDで再適用して成功し、sourceSequence88・公開世代 `k75-15070b498ab7cd4c0ad54cdfd79b2428` は変化しなかった。再送による記録の追加を起こしていない。

独立環境に会員runtime・Google設定を接続していない。ヘッダの会員操作はこの確認面だけ非表示にする。既存会員Capsuleの保存・共有・コメント・OGPの接続はU4、利用者投稿のAI一次チェック・審査中・修正はU5、実Workerと予算管理はU6。今回の成功を、それらや年表同士の比較／マージの完成とは扱わない。

入力画面は一つの根拠・暦の時点／期間を扱い、APIで保持できる複数根拠・複数時間・周期／定性の全編集UIではない。Entity名訂正・ThemeタイトルはRecord草稿と同じ再開対象ではない。Theme一覧の全件再認可や実大規模探索の性能・iPhone実機は未確認。全量移行・旧検索/URL/会員接続はU7以降に残る。

## 最終配置

3276のアプリソースは **`01a71c0b75bd4bdec22da6c8a3ac056ab0ee1aa0`**、最終buildは **`_f21c1Z-S0V27wC8OL9vN`**。webpack production build・全TypeScript・page generationが成功し、専用publisherとWebを再起動した。最後のcompact変更でIconの未対応propを型検査が検出したため、Icon APIを拡張せずwrapperへ移して修正し、関連19テスト・lint・buildを再実行した。

再起動後のroot HTTP200で中央WorkspaceのHTMLを確認し、上記HTTP acceptance15回も最終buildで再成功。公開世代は `k75-15070b498ab7cd4c0ad54cdfd79b2428`、pending false、lastFailure null。旧U2 buildや途中のU3 buildと混同しない。

mainは `cd84b76ecf5b5f36009fb43ee01ffc7ac6cf9206` のまま、未追跡 `memo.txt` のみ。main／3200／HTTPS β／本番、既存Worker・AI・会員DB・本線KGへ今回の変更を反映していない。上記ソース以降の配置識別記録は文書だけの変更で、アプリの再buildは不要。
