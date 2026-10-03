# 少数実データパイロット v1の実施記録

2026-10-03。[設計案](../../design/REAL_DATA_PILOT.md)を採用し、収集・投影・検証・分離環境・ブラウザでの操作確認を実施した。一般公開、大量取り込み、オンライン更新、利用者評価の完了ではない。

## 受け入れたデータ

| Entity | 内部対象 | 確認したQID |
| --- | --- | --- |
| 浦沢直樹 | 人物 | Q348436 |
| 長崎尚志 | 人物 | Q3514203 |
| 手塚眞 | 人物 | Q6724933 |
| 勝鹿北星 | 人物 | Q11264988 |
| 手塚治虫 | 人物 | Q193300 |
| PLUTO | 漫画作品 | Q1197216 |
| MASTERキートン | 漫画作品 | Q1185624 |
| BILLY BAT | 漫画作品 | Q594758 |

内部UUIDは[台帳](../../../datasets/pilot-urasawa/v1/ledger.json)で固定。名称の一致だけではなく、対象の職種・種別、日本語label/alias、漫画・アニメ等の区別を照合した。勝鹿北星のQIDは日本語labelが別筆名の「きむらはじめ (漫画原作者)」で、aliasに勝鹿北星がある。表示名は出版社で確認した名を使い、他の筆名を検索aliasへ自動展開しない。名称・同一性の取得由来と関係の根拠は別記録。

| 根拠 | 受け入れた独立Claim |
| --- | --- |
| [小学館・PLUTO第1巻](https://shogakukan-comic.jp/book?isbn=9784091874313) | 浦沢直樹、長崎尚志、手塚眞→PLUTOの制作関与3件。プロデュース・監修等の原表記を保持 |
| [小学館・MASTERキートン完全版第1巻](https://shogakukan-comic.jp/book?isbn=9784091841612) | 浦沢直樹、勝鹿北星、長崎尚志→MASTERキートンの制作関与3件。脚本等の原表記を保持 |
| [講談社・BILLY BAT第4巻](https://www.kodansha.co.jp/comic/products/0000014047) | 浦沢直樹、長崎尚志→BILLY BATの制作関与2件。著者欄とストーリー共同制作の記載を確認 |
| [関東弁護士会連合会の本人インタビュー](https://www.kanto-ba.org/series/211/) | 浦沢直樹→手塚治虫のINFLUENCED_BY 1件。絵柄の質問に対し、影響を受けた人物を本人が明示 |

提案の4人物から手塚治虫1人物・影響1 Claimを追加した。制作と影響の条件選択を実データで試すためで、作品から作者への推測ではない。初回を広い対象群へ増量しない。

8 Entity / 9 Claim / 4 Source / 9 Citation / 8 ExternalIdentifier＝**38ノード**。SUBJECT 9 / OBJECT 9 / HAS_CITATION 9 / CITES 9 / HAS_EXTERNAL_ID 8＝**44 Relationship**。表示Relationは9件。Sourceは全件isDemo=false、公開Claimは全件affirmedで支持Citationあり。関与期間は全件不明、Web公開日も判明しないためnull。発売日・取材日は台帳の別項目。書籍本文を確認したとは記録しない。

保留は台帳のdeferredに記録した。PLUTOの手塚治虫の原作由来、手塚プロダクションの協力は現行predicateへ無理に変換しない。インタビューに登場する他の影響元は対象外・同一性未審査。出版社への所属・雇用、アシスタント関係は今回確認した資料では採用しない。不在を否定Claimへ変換しない。

講談社の古いURLは現在の商品URLへ変更し、旧URLも台帳に残した。Webツールでは403になる場合があったが、通常のHTTP取得でも本文のクレジット・書誌・共同制作表記を確認した。検索結果の断片だけを根拠にしていない。

## 保存と生成

[datasets/pilot-urasawa/v1](../../../datasets/pilot-urasawa/v1/README.md)へ版付き台帳、8件のWikidata原JSON、投入用data.json、hash付きmanifestを保存した。原JSONは全言語labels/aliases・元statement/qualifier/referenceを取得時のまま残す。今回そこから関係Claimを生成しない。

台帳には言語付き名称・原資料の表記・優先名・採用判断、QID/revision/取得時刻/URL/hash、役割原表記と要約、資料の巻・版・ISBN・限定、支持Citation、確認日、保留理由を保持。表示に採用しない名称も原JSONから失わせない。原取得はCC0-1.0と記録し、出版社・記事の利用条件とは分ける。記事全文・HTML・表紙画像をパッケージへ転載しない。

lib/server/pilot-dataset.tsはv1に限定したschemaと投影を担当する。名称の出所、検索aliasとの一致、QIDと外部ID、原JSONのhash・revision・種別、Claim/Citation参照、支持根拠、実Sourceを検査する。Citation.noteは構造化した役割・限定・理由から生成し、現行APIで読めるようにした。投入用JSONは現行strict schemaを再利用し、余分なDB項目は加えない。生成は外部アクセスなしで再現可能。

ファイル台帳は収集の正本・証跡、Neo4jは読取用の投影であり、別DBに第二の運用Knowledge Graphを持たない。APIに言語付き名称・取り込み履歴の閲覧機能を追加したわけではない。

## 環境分離と誤投入防止

- compose.pilot.yamlは専用project/volumeと7475/7688。demoの7474/7687・既存volumeは維持。
- .env.pilot.exampleを用意し、専用コマンドが.env.pilotを読み込む。既存.envは変更しない。接続先とモードが一致しない場合は拒否。
- seed CLIは明示したdatasetとGRAPH_DATASETを照合。既定はdemo、pilot:seedはpilot-urasawa-v1を指定。
- seedの書込みトランザクション内で全既存Node/Relationshipを確認し、対象外または重複関係を拒否する。demoと実データの混在、変更済み値の上書きを認めない。
- Nextのパイロットは3211・.next-pilot。Server Componentで表示モードだけをクライアントへ渡す。接続情報は渡さない。
- ヘッダーに少数実データ・非網羅・共通作品は直接の人物関係ではないことを表示。検索例も実データへ変更。無条件ゼロは「今回の登録範囲」であると明示する。新しい表示文字列はlocale解決境界へ置いた。
- demo統合テストはパイロット設定を拒否。パイロットの実DB・ブラウザテストは専用コマンド／configで分離。手動cypher-shell等の任意書込みまで防ぐ権限基盤は今回作っていない。

データ更新基盤や新たな運用メタデータNodeは追加していない。確定版の同一内容は再seed可能、変更版は別環境を検証してセッションを再開始する。seedの差異拒否は維持した。

## ブラウザでの確認と観察

PlaywrightのChromiumを実DBにつなぎ、Canvasの実クリックと表示・API結果を確認した。想定経路は浦沢直樹→PLUTO→長崎尚志→MASTERキートン→勝鹿北星。BILLY BATも展開し、合流・循環で8 Entity / 9 Claimのまま重複しない。起点を閉じると1 Entity / 0 Claimになり、再開で受理済み全範囲が復元する。

初期は5 Entity / 4 Claim。影響だけでは2 Entity / 1 Claim、アシスタントだけでは条件内ゼロ。英語名Naoki Urasawaでも同じ人物を検索でき、青葉ハルはパイロット検索に出ない。線からプロデュース／脚本／ストーリー共同制作の正しいClaimとSource URL・期間不明・引用対象の限定を確認した。

画像を実際に確認：[初期](pilot-initial.png)、[全展開](pilot-expanded.png)、[引用詳細](pilot-evidence.png)。全展開の画像は「全体を表示」後、詳細の画像は対象Relation周辺へパンした状態。

| 観点 | 今回の観察 | 分類・次の対応 |
| --- | --- | --- |
| 探索の面白さ | 著名な漫画家のプロフィールから、作品を介して長崎尚志の異なる制作関与へ移れる。単なる作品リストより接続の共通点を辿れる | 価値のある経路は成立。ただしCodexの操作観察で、利用者が面白いと感じたという証明ではない |
| 制作関与の粗さ | Graph上では作画等の制作クレジット・脚本・監修・プロデュースが全て同じlabel。人物同士の直接の共同作業も示していない | 意味の粒度／presentationの課題。大量増量より役割と根拠の限定の見せ方を先に検討 |
| 根拠の理解 | Citation.noteに原役割と巻・版・限定があり、SourceのURLを開ける。期間不明と発売日の違いも説明できる | 詳細を読めば区別可能。ただし役割が引用の下部にあり、目につくまで読取が必要 |
| 交差・ラベル | 全展開では中心下側で線・labelが交差。あるEdgeの中点クリックが、交差する別Edgeを選んだ | データ重複ではなく表示上の曖昧さ。線の交差から離れた実クリックで正しいClaimを確認し、一覧でも確認可能。配置・ヒット対象の改善余地として残す |
| 長い名称 | MASTERキートンが既存の固定Node幅を少し超える | 表示課題。今後長い題名を増やす前に確認する |
| 網羅性・条件 | 他の人物・影響元やアシスタント・組織は未収録。各関係は1 Claim/1 Citation | データ範囲の制約。未登録を現実の不存在としない。矛盾比較・高次数・ページングはdemo回帰が担う |

**次は、まずこの凍結版を利用者に触ってもらい、その後、役割と引用範囲を読み取りやすくする小さな表示改善を優先する案を推奨する。** いま全面的な役割taxonomy・更新基盤を作らない。役割を構造化してAPIへ出す必要が出た場合は、自由文をregexで推測せず、台帳の構造化情報を引き継ぐ境界を設計する。探索経路が足りないという観察が得られた場合だけ、同じ収集契約で少数の資料・関係を追加する。

利用者3〜5人の観察は未実施。今回の手動に相当する短い操作とブラウザ検証から、価値検証用のデータと環境は用意できたが、面白さの結論は利用者の実操作を待つ。

## 変更範囲と検証

作成：datasets/pilot-urasawa/v1一式、lib/domain/dataset.ts、lib/i18n/dataset.ts、lib/server/pilot-dataset.ts、scripts/pilot.ts・prepare-pilot.ts、compose.pilot.yaml、.env.pilot.example、pilotのunit/integration/e2eとconfig、この記録。

変更：seedとCLIの分離検査、Neo4j接続先検査、Page/Explorer/RelationsList/SearchPanelの表示モード、package scripts、Next出力・ignore・型生成対象、demoテストの対象検査、README/現行docs。API契約、Claim/Citation/SourceのDB表現、predicate、demo fixture、Graph配置・曲率・操作・上限は変更していない。

| 実行した検証 | 結果 |
| --- | --- |
| pilot:prepare / pilot:validate | 成功。台帳から生成、原取得と投影・manifestの整合を確認 |
| pilot:seed（初回） | 38 Node / 44 Relationship作成 |
| pilot:seed（二度目、最後にも再確認） | 作成0 / 0、件数不変 |
| npm test | 4ファイル / 89件成功 |
| pilot:integration | 1件成功。二度目のsnapshot一致、demo投入拒否後のsnapshot一致 |
| test:integration | 再実行で20件成功。初回は19件成功、DB復旧直後の1件が失敗 |
| pilot:e2e | 2件成功。実際のCanvasクリック・詳細・条件・復元・英語名検索を確認 |
| test:e2e | 初回17/20成功、--last-failedで残る3件全て成功。単一実行で20/20成功したという記録ではない |
| typecheck / lint | 成功 |
| build / pilot:build | 両モード成功。/と読み取りAPIはdynamic |
| 文書リンク・差分 | ローカルリンク148件存在、git diff --check成功 |

実行環境はNode 24.21.0。demoの統合テストはAPI_TEST_BASE_URL=http://127.0.0.1:3210で既存サーバーを再利用し、終了後にブラウザ回帰を実行した。ブラウザはGRAPH_TEST_REUSE=1で各専用サーバーを再利用し、この環境ではChromiumの共有ライブラリ用LD_LIBRARY_PATHを指定した。

初回のpilotブラウザ確認はJSON import attributeの不足を修正し、初回APIコンパイルが5秒のexpectを超えたため専用configで15秒へ調整した。交差する別線をクリックしたケースは、対象を識別できる線分を実クリックするよう修正した。元のGraph表示・クリック実装は変更していない。

demoの初回失敗は検索後近傍とClaim詳細の待機、300msの操作順序に関する3件で、個別再実行は成功した。負荷下の時間依存テストの不安定さは残る。DB復旧テストはコンテナの疎通だけではアプリの既存driverが再接続済みとは限らないことを確認し、最大30秒の200復旧待機後に応答内容を検証するよう変更した。503・400・復旧後のデータ確認は省いていない。最初の型検査でVitestのpoll option名をintervalsと誤記したためintervalへ修正し、その後typecheckと両buildは成功した。

ブラウザ画面確認後、台帳の短い原引用を必要な範囲へ絞り、manifestを再生成した。投入用data.jsonの内容は変わらず、最終seedも0 / 0。最後に3211のHTTP 200とNaoki Urasawa検索で浦沢直樹が返ることを再確認した。
