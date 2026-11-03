# U5途中：原資料照合・自動受理・公開と訂正

2026-11-03。前段の[キュー](KNOWLEDGE_REVIEW_QUEUE_U5_20261103.md)に続く実装。[現行契約](../design/KNOWLEDGE_SUBMISSIONS_U5.md)。U5全体の完了ではない。今回の狙いは、本人の新しい公開依頼→AI→原資料→受理→公開モデル→結果・訂正を接続すること。

## 判断

- 公開意図を含む新しい同意版を使う。旧AI確認だけの同意・過去の取消済み試験から自動公開しない。
- 原資料は匿名の公開HTTPS HTML／text。接続先のIPを検査・固定し、redirectも再検査する。TLS検証を無効にしない。取得量・時間・試行数を有界にし、script／非表示要素などを除外した静的本文と引用を照合する。要約を引用一致へ読み替えず、書誌・PDF・JS依存などは補足へ戻す。短い固有名詞を一律禁止する最小引用長は設けない。
- AI送信前と公開直前に現在の参照・取得版を確認する。未入力や権限・版の不成立にはAIを送らず、送信予約も消費ゼロへ確定する。本文全体を追加でAIへ送らない。
- 会員DB追加022へ原資料照合試行・受理済み公開decisionを置く。既存001〜021のchecksumを変えない。公開知識DBの既存operations／changesをreceipt／投影outboxとして使い、新しいmigrationは追加しない。
- 公開transaction内で参照をlockし、会員DBで本人・内容版・取消・AI結果を再確認してdecisionを先にcommitする。その後に知識DBをcommitする。途中停止は同じdecision IDの再送で収束する。受理済みの公開向け断面は、退会で私有草稿が消えた後も再送できる。受理後の取消と公開停止は別の意味として表示する。
- 対象や資料のIDはサーバーで発行し、同じ受付版の複数項目は参照を再利用する。名前一致による既存人物への自動統合はしない。未選択情報・私有の対象説明／別名は公開しない。選択した資料の書誌はAIの文脈へ含め、公開でも保持する。
- 訂正先はサーバーで捕捉した元の公開版／本人Capsuleと照合する。IDを知るだけで既存記録を上書きできない。両端・種類・具体関係・肯否が変わるものは別知識へ戻し、旧KGの型付き限定を平坦化して自動受理しない。
- 公開先は通常Explorer内の`krecord`直リンク。関係図・説明の表示、Capsule作成、別タブの訂正入口を同じ公開原記録に接続する。条件を満たさない項目の結果と、本人一覧の公開／補足件数を区別する。

## 実操作（HTTPS β・実Google／実AI／実原資料）

確認先は[本人の投稿一覧](https://graph-beta.isinxnisi.com/member/submissions)。指定された既存Googleセッションを維持し、新OAuthログイン・本人年齢確認は行っていない。

1. 「知識を書く」からNASAのWebb打上げを2項目で入力。1項目目は `Ariane 5 → 打ち上げた → Webb宇宙望遠鏡`、2021-12-25の時点、NASAの公開URLと原文抜粋。2項目目は同じ打上げ事実を、意味は一致するが原文と異なる抜粋で提出した。草稿保存だけではAI送信・公開しない。
2. 公開を含む新しい確認欄を選び「知識を届ける」。実Geminiは両方を正当・支持ありとし、原資料工程で1項目目だけ公開した。2項目目は「抜粋を原資料の本文に見つけられませんでした。要約ではなく、資料から引用した文章を確認してください。」へ戻った。
3. [公開された関係](https://graph-beta.isinxnisi.com/?krecord=submission%3Ab68bc162-6a51-4282-8282-54381405332b%3Arecord%3A310d43a1a577fd4d)を通常Graph領域で開き、具体関係・両端・根拠・日付を確認。同じヘッダのCapsule作成から年表を表示して本人保存した。
4. 詳細の「訂正を提案」から別タブの読取プレビューを確認。「訂正の草稿を作る」を押した時点で捕捉し、同じ関係の表現だけを訂正して提出。新しい関係へ複製せず、同じ原記録の内容版2になった。対象2件・資料1件は版1のまま。原記録の版1・版2を共に保持している。
5. 閲覧中の旧Graphは突然差し替わらず、「新しい公開版があります」→「最新版を読む」を表示した。明示切替の最後の操作はブラウザ接続のtimeoutが起きたため再確認対象とし、公開読取APIでの内容版2を別に確認している。Chrome再起動後は新しい通常Graphタブでも内容版2の両端・具体関係・日付・根拠を確認し、スクリーンショットを保存した。先に保存した[年表付きCapsule](https://graph-beta.isinxnisi.com/member?capsule=a9c8d19f-73a8-4bdf-98db-cc23e387a149#my-capsules)は保存版1・元の内容版1を保持。「取得元の更新」で1→2の差分を表示し、草稿への取込、未保存表示、取込の破棄、元の保存断面の保持まで確認した。
6. 結果リンクの前には受理済み・投影待ちを区別し、generationへの反映後に公開リンクを表示した。新APIで具体語「打ち上げた」の検索・関係図取得・内容版2の読取を200で確認。旧KGをまたぐ既存の全検索UIの統合完了ではない。

### 実操作で修正した点

公開記録からの訂正はCapsule由来ではないが、AI受付応答だけが空のCapsule originを返し、画面のschema検証で通信失敗として止まった。公開は重複せず完了しており、本人の最新状態読取で回復した。`capsuleId`がある場合だけoriginを返すよう修正し、公開捕捉→受付→AI依頼→同じ依頼の再実行の全DTOをschemaで確認する結合回帰を追加した。確認結果もjobの返却順ではなく入力項目順に揃え、逆順応答の画面回帰を追加した。修正後のHTTPS βで同じ訂正草稿を再提出し、返却エラーが起きず、取得元の現在版を確認する補足案内まで表示された。公開版をさらに上書きせず、AIも追加送信していない。

PC幅1920pxで実操作した。390×844のviewport設定を2回と新規tabで試したが、実測innerWidthは1920のままで設定が反映されず、resetした。**この工程のスマホ幅の実ブラウザ確認は未確認**。設定を呼んだことだけでスマホ確認済みとは扱わない。先行U5のresponsive設計・テストは維持しているが、iPhone実機を代替しない。

### 実AI利用量

この工程の実APIは3回（新規2項目、訂正1項目）。入力1311、候補出力193、provider total1504 token。包括的なoutput/thoughtsは欠測で、ゼロとはみなさず既存予約・精算方針を保つ。外部送信・消費回数の累計は65→68、LA日付2026-11-03は37→40、月68。修正後に古い取得版を実画面から再提出し、現在版の不一致をAI送信前に補足へ戻した。台帳は69試行（うち1件not-sent・消費0）、外部送信は68のまま。再試行による追加AI送信・公開記録の重複なし。無料project／評価済みmodel／key／上限を変更せず、有料fallbackなし。共通Kevの起動・停止・設定変更・今回の追加評価もない。

### 機能・障害テスト

- 単体・画面73件、AI接続／判定部品16件、実OIDC fixture＋専用PostgreSQLの結合31件が成功。実Googleとfixtureを混同しない。
- 引用不一致、429／5xx待機、内部／特殊IP・DNS固定・redirect再検査、取得量／形式、取消中の応答、停止／退会、2DB間のdecision前後の停止、ack消失と再送、旧保存版保持、照合中の参照非公開化、偽の訂正IDをAIへ送らない／利用量ゼロ、退会後の受理済み公開再送を含む。
- 新しい引用・書誌は必要な選択内容だけを送り、捕捉Capsuleの非選択情報・私有の説明・別名・文脈書誌を送らない回帰も通過。
- lint、型検査が成功。追加した逆順fixtureの配列で文字列literalの型推論エラーがbuildに見つかり、テストの型指定を修正して再検査した。失敗した資材は配置していない。
- localhostの匿名投稿APIは401、operator知識API／KG管理は404。HTTPS βの本人操作が正常であることを別に確認した。

## 配置・保全

会員migration022のみ追加。000〜022の23件、全既存checksumは保持。知識DBは001／002のみを維持し003を適用していない。会員45table・知識13tableをfresh custom dumpし、各実ownerで別DBへ復元、全既存行のfingerprint一致、会員の移行と再実行不変、live移行直後の旧行保持を確認した。追加後の会員は47table。heartbeat等の通常更新は別扱い。

- backup（開発PC内・private）：`.local/u5-acceptance/backup-4fdea349663e/`。
- member dump SHA256：`8fd374614e78a481abff173eb37cc358b558c4642d2320cdad27796d516fb8f4`。
- knowledge dump SHA256：`688cf1d9e9c132c489b140c72bab75a2a841b1bcf6ce5c303827379f90b4e71c`。
- 初回配置：source`7a4f2ddc9fe3fc74cefb9c41c03573674e830675`、build`gkPxYs8Vi1ngBflOoFbkg`。022のroute file trace・readiness・worker heartbeatを確認。
- **最終配置：source `e3b7e5caec1e830aad0b5437591bae982454ac4a`、build `rbLDeOtrWsJT7AL8c8eLV`。** main・`codex/issue75-theme-foundation`へ通常push済み。修正commitは`4269f7eb`、fixtureの型修正は`e3b7e5ca`。Web／同review workerのみ再配置し、追加DB移行なし。build内の型検査・生成・file traceと実稼働BUILD_IDの一致を確認。

3200とHTTPS βは同じ実行物・既存認証を使う。3276はU4のまま。本番VPS・本線KG・既存AI artifact・収集／Kevは未変更。旧dumpでlive DBを上書きしていない。新しい受理状態を読める互換buildを保管し、旧AI-only Webへ機械的に戻さない。起動は[β runbook](../runbooks/KNOWLEDGE_BETA.md)を使う。

## 残る範囲

異議・例外への運営対応、旧KG型付き記録の自動受理／訂正、PDF等の原資料、一般利用者へのAPI条件整備、総合確認は未完了。従来KGと新公開モデルをまたぐ全検索の統合・本番切替は、後続のU7／U8と区別する。今回の公開検索APIと直リンクを、既存検索全体の移行完了と呼ばない。


## 確認手順・再開

1. HTTPS βの「知識の投稿」で `U5確認｜Webbの打ち上げと知識の公開` を開く。項目1の公開先と項目2の補足理由を比較する。
2. 公開先の通常Graphでは内容版2を読む。詳細の「訂正を提案」から元版を確認し、自分の草稿を作る。内容を送らない限りAIも公開も動かない。
3. 本人の保存Capsule `Ariane 5は2021年12月25日にWebb宇宙望遠鏡を打ち上げた。` は元の内容版1を保持する。編集→取得元の更新で1→2を比較できる。保存して確定する前に取込を破棄できる。

既存private runtime・認証・無料API profileを引き継いで、main directoryから次を実行する。DB containerが停止している場合は[β runbook](../runbooks/KNOWLEDGE_BETA.md)の既存専用DBを先に再開し、既存DBを作り直さない。

```sh
python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node
```

最終確認用画像は開発PCのCodex visualization directoryに `u5-acceptance-beta-public-record.png` と `u5-acceptance-beta-capsule-comparison.png`。前者は最終buildの通常Graph内容版2、後者は保存Capsuleと取得元1→2の比較。Chrome再起動で接続は一度復旧したが、その後もCDPのnavigation timeoutが発生した。確認できた画面と未確認のモバイル幅を区別する。ブラウザの接続保護を回避したり、既存ネットワーク・認証設定を変更したりしていない。
