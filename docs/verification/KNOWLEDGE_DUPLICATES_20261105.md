# 利用者投稿の重複対策

2026-11-05。[契約](../design/KNOWLEDGE_DUPLICATES.md)。main／localhost:3200／HTTPS βへ反映し、実Google本人で新規投稿から登録済みの結果まで確認した。U6全体／本番公開の完了ではない。

## 実装

同じ正本ID・条件の既存知識を候補にし、完全一致と別軸の意味比較で同義の新規投稿を既存Recordへ寄せる。新資料だけは根拠追加、別テーマは参照追加、追加なしは`existing`。変更なし訂正も内容版を作らない。既存の同じRecordへの意図した文言訂正は保持する。

`existing`は新しい貢献活動を作らず、結果カードに登録済みと既存の公開先を示す。同じ資料の題名・追跡URL・箇所・抜粋を変えるだけで独立根拠を水増ししない。元Recordと引用、既存Theme版／Capsule断面を保持する。追加migrationなし。

## 検証

- 単体・PostgreSQL・UI：75件成功。うち専用のDB試験7件で、重複時にRecord／内容版／資料／公開changesが増えない、独立資料追加、明示選択したThemeだけ更新、別Themeへの参照追加、同時受理、本文hashによる別URLの水増し抑止、非公開資料の漏出防止を確認した。
- 別の使い捨て会員DBによる実OIDC fixture・受付・原資料照合・受理・参照：46件成功。追加2件で、新規投稿として送った同じ事実、変更なし訂正が既存ID／版1を返し、貢献活動を増やさないことを確認した。実Googleとは区別する。
- Gemini実API：比較16ケースの最終判定がすべて期待と一致。言い換え・翻訳・追跡URL、役割違い・具体性・追加日付・別日付・追加事実・不確実性・候補内指示・根拠のない承認指示を含む。既存候補を根拠として借用する誤受理なし。背景だけの資料に`unclear`を期待した1件は`unsupported`だったが、どちらも自動受理しない同じ結果である。全ラベル完全一致とは報告しない。
- 同じ無料projectの永続予算を予約して19 HTTP試行を記録した。初回の503が2件、配送結果不明が1件あり、2分以上空けた明示的な二回目で確認。結果不明の消費をゼロ扱いせず予約を保持した。新たな課金／鍵／共通Kevの変更なし。[匿名化した結果](assets/knowledge-duplicates-20261105.json)。
- 初回の共有DB試験では別ファイルの並行作成を全体件数に含めてしまい、試験を対象prefixの件数へ修正した。旧訂正試験では意図した文言改善まで重複として扱う問題を見つけ、同じRecordへの明示訂正を保持するよう修正した。修正後の上記結果を採用する。

## 残件

自然言語の重複を完全に証明する仕組みではない。別IDで作ったEntityの同一性、既存の重複Recordの整理、収集／Chat経路全体への接続はU6残件。正常な同名別人を自動mergeしない。本変更を全経路の重複解消として報告しない。

既存の候補が受理直前に増えた場合は再確認へ戻す。確認不能を「新規」として通さない。候補上限に達した場合も先頭分だけの照合を完了と扱わない。高並列時のlock細分化、幅広い未見言語・表現の追加評価は後続。


## 配置・実操作

- Web app source：`9e679afd0a3af2abbb397536d907ef2aba60b8f8`、build **`eltwp98MIdtjfECPyDKAt`**。最初のbackend切替は`16cba5e4`／`Et17Y33s6K6OJjmTvAoEz`で、以後は登録済みの件数表示をWebだけで修正した。review／publisher／collectionのpolicyファイルは後者から変更していない。最後のWeb切替は4 WorkerのPIDとprivate profile hashを維持した。
- 既存3200のTOPはHTTP 200。HTTPS βでは既存Googleログインを使い、本人の新しい匿名草稿を作成。テーマ「Webbが宇宙でひらくまで」へ、既存と同じ打上げ時刻とNASAの原文を投稿した。資料URLだけ`utm_source`を追加した。
- 本人用確認先：[検証用投稿](https://graph-beta.isinxnisi.com/member/submissions?id=7bba56c8-9d8b-444c-8838-803adf35327d)。一覧名は「【確認用】重複投稿は記録を増やさない 20261105」。現在ログインしている本人だけが読める。
- 原資料照合とGeminiの実応答を経て`published / disposition=existing`となり、既存Record `submission:9ac202ad-e212-42f8-ae3a-dbd1b2b4ce1e:record:ca7666b1909e7cef`の版1を返した。実送信policyは`knowledge-review-gemini-v1+knowledge-duplicate-v1`、試行1件。観測入力838 token、出力の一部利用量は不明のため予約を残し、ゼロ扱いしない。
- 結果カードと一覧に「登録済み」と表示。「1件公開」が残っていた箇所も修正し、「1件登録済み」へ統一。既存の公開先を別タブで開き、元の本文・NASA資料・内容版1・元の投稿者が保持されていることを確認した。今回の新しい貢献活動は0件。
- 26 Record版・5 Theme版・25 Capsule・既存migration ledgerのfingerprintは、検証用投稿の前後で一致。既存ユーザーの未読7件は既読にせず、今回の検証結果だけ既読にした。
- PC通常幅と390×844のスマホ幅で結果カードを確認。横はみ出しなし（viewport390、document scrollWidth380、カード幅348）。仮のviewportを解除し、PCの結果画面を残した。ブラウザのerror logは0件。[PC](assets/knowledge-duplicate-pc-20261105.jpg)／[スマホ](assets/knowledge-duplicate-mobile-20261105.jpg)。
- 件数表示の追加回帰は42件成功。新たなbuildのTypeScript／lintも成功。基本会員fixture36件も成功。確認中に見つかった共有statusのテスト2件は、既に存在する`sourceAvailable:true`を厳密比較の期待値へ追加した（製品の共有動作は変更していない）。

## backup・再開・範囲

会員62 table、知識14 tableをPostgreSQLのexported snapshotと同じ断面からcustom dumpにし、各々別名DBへWeb roleで復元して全table fingerprintが一致した。稼働中のheartbeatがあるため、別々の時刻のlive fingerprintをdumpと比較していない。適用済みchecksumは変更せず、追加migrationなし。会員000〜028／29件、知識001/002/004を維持した。

復元確認資材（private）：`/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/submission-repair/duplicate-snapshot-2b65e657-d941-4d55-9d78-f244b5cda2a1`。backend切替直前にも両DB dumpを保存した（`/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/submission-repair/duplicate-activation-backup-20261104T153221Z`）。最後のWeb資材backup：`/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/submission-repair/duplicate-counter-backup-20261104T154220Z`。旧dumpでlive DBを上書きしない。

既存launcherで再開する：`python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node`。既存private profileとDB接続を引き継ぐ。共有Kev・他プロジェクトのcontainer・Cloudflaredをまとめて再起動しない。

3276、本番VPS、旧KG、認証設定、AIラボ資材は今回更新していない。U6のEntity同一性／Chat取込／総合一巡、収集経路全体への重複対策、U7／U8は未完了のまま。
