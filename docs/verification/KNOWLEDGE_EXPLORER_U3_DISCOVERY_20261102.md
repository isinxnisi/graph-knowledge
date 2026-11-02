# U3：既存TOP・検索・Graphへのテーマ導線統合

2026-11-02。Issue #75／本運用統合U3。作業branch `codex/issue75-theme-foundation`、独立3276だけに配置する。main、3200、HTTPS β、本番は今回更新しない。共通holdを保持し、`memo.txt` と未受入自動候補を取り込まない。

## 実際の確認先

- TOP：<http://localhost:3276/>
- 年表・関係図：<http://localhost:3276/?ktheme=u3%3Afbaa9ee12f288cfa%3Atheme&krev=1>
- 関係図のみ：<http://localhost:3276/?ktheme=u3%3Areal-manga%3Atheme&krev=1>
- 通常探索の関連Theme：<http://localhost:3276/explore/29e9caea-6c44-4c1f-9abc-f4350003ca3b>

TOPの「紹介テーマ」から開く、または「テーマを探す」→名前・説明／表示内容を選んで開く。テーマは同じ中央で読み、年表見出し内の分割iconで関係図を開閉する。「探索に戻る」で元のGraphへ戻る。ホームlogoはTOPへ戻る。検索は既存の「一覧・条件から」等と同じモーダルに「テーマから」を追加した。

## 今回の実装

従来のU3は既存Explorerに似た別shellをflagで表示しており、既存TOP・検索モーダルへ接続した実装ではなかった。今回 `KnowledgeWorkspace` の置換shellを廃止し、既存 `Explorer` 本体・`DiscoveryHome`・`DiscoveryExplorer`・`SearchPanel`・通常Graph・対象詳細を起点に統合した。`KnowledgeReading` は中央読取・右詳細のslotを供給する。左右の探索機能をモックへ差し替えない。

- 紹介Themeはデータ設定により選定。PCは約3枚、狭い画面は横送り。件数3のデータ制限は置かない。
- 新着Themeは最大8件、最初の登録日順。閲覧や構成更新で登録日を変えない。
- 一覧で「関係図」「年表・関係図」「年表」「解説」をicon＋文字で示す。具体的な時間注釈・relation有無から判定する。
- 名前・説明、年表／関係図のみ／解説、新着順／名前順を組合せ、tab間で条件を保持。スマホは分類・並び順を折りたたむ。
- 検索中は旧結果を操作不可にし、遅い応答で新条件を上書きしない。公開停止の依存先を持つThemeは紹介・新着・関連・検索へ返さない。
- 既存Graphを隠して保持し、Themeの図と同一stateにしない。既存探索URLの自動更新が `ktheme` を消さないよう、Theme/common読取中だけ休止する。
- Nextの同一路線ホームLinkはpopstateを発生しない。その移動でもThemeを閉じ、URLだけTOPになる不整合を修正した。Theme取得途中に別の探索へ移った際も遅い取得を失効させる。
- 解説のみのThemeには空のGraph枠を出さない。
- Theme/common読取中に裏の旧Graphを意図せず保存しないよう、既存の保存ツールは探索へ戻るまでdisabledとし、その理由をtooltipへ示す。条件付きの既存検索からもThemeを閉じて通常探索へ入る。

## データと環境

専用PG 55475・common公開投影Neo4j 7698を維持する。既存Explorerが実際の対象・関係を読むため、既存確認KG 7697へ読取サービスから接続する。秘密値は既存0600の `~/.local/state/plunode-previews/beta-confirmation.json` を参照し、repoへ複製しない。KG管理・書込API、会員／Google runtimeは有効にしない。既存KGの投入・設定変更、3200／β Webの更新は行わない。

紹介する実ThemeはWebb展開、漫画をつくる人々、Webb国際協力の3つ。漫画Themeは通常 `/api/knowledge` の1回の `create-theme` により既存の3 Recordを版1で選択した。新規Record・資料を捏造せず、由来・根拠・EntityのIDを引き継ぐ。描画専用コード・意味定義を追加していない。選定と短い紹介文は人が補った。新たな根拠読解の所要時間を測定した実証ではない。

追加したTheme ID：`u3:real-manga:theme`。選択Recordは `69ed2335-344f-41a6-a17f-77708faa0398`（大友→童夢）、`29f3bd67-b461-49a8-bdfa-d98b1d7dcfe1`（長崎→BILLY BAT）、`b6ce3407-e3bb-44c9-867b-7b7434861af5`（浦沢→手塚）。それぞれの具体的な関係語・書誌を固定する。

作業前の新backupは `.local/issue75/u3-integration-before.dump`（449,585 bytes、SHA256 `b654e04b9b2e1f737f349c21ab4d433777c8d0f04fd3e3ed235bbd52e21c963a`）。追加前のcatalogもprivate領域へ保持した。HTTP照合により既存25 Entity／21 Source／26 Record／5 Themeと各状態が不変、Theme構成が1件だけ追加されたことを確認する。適用済みmigrationの変更・追加はない。

以前のU3-before backupも新しい検証DBへ復元し、原行の保持・旧theme75.state・migrationのchecksumを再照合する。元DBへのrestore/resetは行わない。結果は [preservation JSON](../research/issue75-foundation/u3-preservation-results.json)。

## テストと実操作

- UI・URL・状態保持46件（新Theme検索4、workspace15、URL7、Discovery状態7、年表UI4、context8、split1）。変更箇所の個別再試行を含む。
- 今回のNextホーム移動・取得中の旧URL・解説専用表示3件。
- 新規の使い捨てPGと専用Neo4jで固定Theme読取13件。種類・名前検索、並び順、登録日の安定性、Record／Theme／Entity／Source停止、旧版認可を確認。最初の試行ではテストの状態版指定を修正し、別試行の5秒timeoutは30秒上限で再実行した。最終13件成功。
- ESLint（変更したTS/TSX）・Python構文検査・Next production buildを実施。
- 読取HTTP確認は [50項目・12 GETの結果](../research/issue75-foundation/u3-discovery-http-results.json)。既存KG IDの接続、紹介・新着・絞込・不正条件拒否、旧catalog保持を含む。
- Chrome実操作：TOP紹介、検索tab、年表＋Webb、種類＋名前のAND検索、tab往復の条件保持、中央への読込を確認。
- 既存長崎探索で5 Entity／8 Claim・zoom92%から関連Themeを読み、「探索に戻る」で同じ件数・zoom92%へ戻ることを確認。
- 390×844のChrome viewportで紹介横送り、検索条件開閉、検索から年表、見出しのicon、年表末尾から外側へのnative wheel連鎖を確認。年表本文scrollTop608（末尾）から次のwheelで中央scrollTop436へ進んだ。iPhone実機・iOSキーボードの再検証ではない。
- 実操作で、カード全体への下線の継承と、紹介枠のgrid最小幅によってスマホの「テーマを探す」が画面外へ出る点を発見し修正した。

最終配置：application source `7c482c9ccedc914878c9414ff7af0b5756d26dcd`、production build `XIpDUEnaZTa2Es7sjBtP6`（`.next-public`）。今回の62件の関連試験、50項目の読取HTTP、型検査込みbuildが成功した。

このbuildで、TOP→年表→ホームLink→TOP、固定Theme URLの再読込、関係図の開閉、separatorの左右キー（52%/48%）、Webb対象からcommon探索（8対象・9関係）→ブラウザBackで元Theme、解説だけの構成、既存の一覧検索から通常Graph（5 Entity・8 Claim）への切替と保存ツール復帰を確認した。ブラウザは通常viewportへ戻し、TOPタブを確認用に残す。

画面証跡は開発PCの `C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/` 以下：`u3-themes-desktop.png`、`u3-themes-mobile.png`、`u3-theme-search-mobile.png`。後二つの見た目は同じCSS修正後、ホームLink修正前の取得であり、最終buildの再確認とは区別する。

## 起動と後続

WSLのこのworktreeで `python3 scripts/issue75-preview.py status`。停止後は既存Dockerを起動した上で `python3 scripts/issue75-preview.py start`。専用PG・Neo4j・publisherの既存volume／private設定を再利用する。既存確認KG 7697の稼働がTOPと従来探索の前提であり、停止時に新DBやdemoへ勝手に切替えない。ソース更新時は共通hold下で `stop` → `build` → `start`。public-kg buildは `.next-public/BUILD_ID` を確認し、以前のdemo `.next/BUILD_ID` と混同しない。

会員Capsuleへの新断面・年表・OGP接続はU4。既存Entity検索の全common対象への拡張・全量旧API移行・大規模catalog性能は統合段階へ残る。Theme内の正確な旧IDは既存探索へ接続し、旧KGにない新common対象はU2の世代読取で同じ中央から探索できる。名前一致で旧KGへ繋がったように見せない。

本番公開、利用者投稿AI審査、有限収集Worker、費用有効化、年表同士の比較／マージを完了した意味ではない。U4以降は [引継ぎ](../design/PLUNODE_PRODUCTION_HANDOFF.md) を参照する。


## commit・運用上の区切り

実装commitは上記source。検証記録・現行設計・README・引継ぎを別の日本語commitへ保存し、同じ作業branchの設定済みupstreamへ通常pushする。main側は確認時 `cd84b76ecf5b5f36009fb43ee01ffc7ac6cf9206` と未追跡 `memo.txt` のまま。自動候補の受入・一括確認済み化は行わない。完了時に共通holdをEnterで解放し、結果を完了報告へ残す。
