# U6c：公開後の意味整理・β検証

2026-11-04。U6の後追い整理のうち、具体語を保つ意味分類・候補確認・まとめて適用を接続した。U6全体の完了ではない。

## 確認先と操作

- https://graph-beta.isinxnisi.com/operations#semantics （現在のサイト運営アカウント）
- 名前・関係名で検索し、チェックして別条件へ変える。選択数から整理欄へ移り、既存定義／新しい定義／対応解除を選択、理由を入力し、対象と内容版を確認して適用する。
- 対応済みの例は「Northrop」「童夢」「BILLY BAT」。公開詳細：https://graph-beta.isinxnisi.com/?krecord=collection-record%3A673bb0541d4ff449bbbd985e86ef8204
- 起動・再開は既存の `scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node`。private profile・DB・認証を引き継ぐ。3200が稼働中なら重複起動しない。詳細は[β runbook](../runbooks/KNOWLEDGE_BETA.md)。

## 実装・判断

共通Record・Mapping・Concept・operationsを再利用した。MappingはRecord内容版に固定し、Concept定義版を上書きしない。50件まで一つのtransactionで適用し、どれか一件が訂正・意味対応変更・公開停止されていたら全件rollbackする。再送は同じrequestと内容で収束し、別内容は409。解除もMappingの追加版で、元の記録や根拠を消さない。

候補は同じ具体的関係名に付いている既存定義であり、意味同一性をAIが保証したものではない。新しい定義は運営が入力する。語義整理を待たずに通常の収集・公開を進められる。今回の操作はAI呼出0回で、無料枠の追加消費を要求しない。Entityの名前だけによるmergeは行わない。

認証済み運営の現在sessionとactive状態をmember DBでlockして再照合する。Origin・JSON容量・strict schemaを検査し、一般利用者・collectorのbatch適用を拒否する。β限定機能で、3276専用operator APIを外部へ開放しない。

元の具体語は表示と検索に残し、意味ラベル・意味IDでも検索できる。現在Recordが訂正されたら旧版Mappingを新しい意味検索へ使わない。Theme・Capsuleは保存したMapping断面を維持し、自動で取り込まない。

## 自動検証

- 現行の対象4ファイルで35件成功。追加の連続完了通知テストを含むUI4件を再実行して成功（関連する一意のケースは計36件）。PostgreSQL試験は毎回新しい `plunode_knowledge75_test_organization_*` DBで実行し、その試験DBだけを破棄した。
- 全件rollback、同時同一requestの再送、異なる再送内容の拒否、定義版不変、actor権限、参照停止、訂正後の旧Mapping、旧Theme断面、解除の旧版保持、25件のページング、ワイルドカードを文字として検索するケースを確認。
- UIは条件を変えた複数選択・隠れた選択の確認・適用前確認・結果不明の同じrequest再送・再認可中の入力保持・同件数での連続通知を確認。運営以外、期限切れsession、別Origin、本番無効の境界を確認。
- 対象ESLint、TypeScript、Next production build成功。初回testの探索条件が `.local` の古いsourceコピーまで拾ったため失敗したが、生成物を除外して現行testだけを再実行した。実DB・現行sourceの不具合と混同しない。

## 実Google・β実操作

既存本人セッションのChromeで以下を実行した。Googleの新規ログイン・再同意フローを今回やり直したわけではない。

1. Northrop→NASAを選択後、「望遠鏡」へ条件変更。見えなくなった選択を保持し、Northrop→Webbも選び、2件を「打ち上げへの協力」へ適用。
2. 元の「共同で責任を担った」「打ち上げキャンペーンの準備と実施を共同で担う」を保持し、通常publisherが新しい公開世代へ反映。意味ラベル検索と意味ID検索で同じ2件、具体語検索で元の記録を取得した。
3. 漫画の実テーマで、童夢の著者とBILLY BATのストーリー共同制作を条件を変えて選び、「作品づくりへの参加」へ適用。役割や対象刊行物の限定は具体的関係名・根拠に残す定義にした。テーマ専用コードは追加していない。
4. BILLY BATの対応だけを解除し、未整理表示を確認。同じ既存定義を選んで付け直し、Mapping版1→2（解除）→3を保持。本文版は1のまま。
5. 公開詳細で元の関係名・資料抜粋・意味ラベルの併記を確認。
6. PC幅と390×844で表示・確認dialog・完了通知を確認。共通CSSでcheckboxが横幅いっぱいになる問題を修正し、最終は幅14px・label flex、横overflowなし。viewportの一時指定を解除した。

操作前後の内容照合は、共通Record全26版・Theme全5版・member Capsule25件・会員migration台帳が完全一致した。意味対応だけが増え、旧Theme/Capsuleを差し替えていない。最終公開世代は `k75-16a3defcdd6095dd527623e7c9d5abf6`、pending=false。検索の小さい実結果は[public-results.json](../research/knowledge-organization-20261104/public-results.json)。

人が補った部分は、二つの分類の名前・定義・適用理由と、どの記録をその分類に含めるかの判断。NASAは既に取得・支持確認済みの文を再利用し、漫画は既存資料locatorと刊行物の限定を確認した。新たに原資料全体を独立に再検証したわけではない。登録負担の時間は計測していない。実操作はNASAが検索2条件・2選択・新定義・一括適用、漫画も同じ経路、その後1件の解除・既存定義への復帰。U6読解からの第二テーマ全体一巡をこの意味整理だけで完了したとはしない。

## 配置・保全

- app source `1a00a448d39e316822fa25125d1ee1d311f2dc19`、build `cUVfr_QUPOYX9Ucm63sEv`。
- 最初の機能source `e8aac12e` をβで確認後、CSS `097d5935`、連続通知 `1a00a448`を追加した。最終は既存webpack cacheを使う前に、exportの全3065 tracked fileがcommitと一致することを検査し、production build全工程を実行した。stage directory名は `submission-repair-097d5935` だがsourceは上記1a00a448で照合済み。
- mainへfast-forwardし、localhost:3200とHTTPS βへ同じbuildを配置。profile hash不変、既存の認証・会員・通常KG・AI artifactを引き継いだ。3276は更新対象外、起動確認なし。本番VPSは未変更。
- 追加migrationなし。会員000〜028（29件）・知識001/002/004のchecksum再確認と再実行で変更なし。切替前のfresh backupは `.local/submission-repair/activation-backup-20261104T125501Z`（member/knowledge dump・旧build、所有者限定）。DBへのrestoreは実行していない。新しいschema migrationがないため、過去に確認済みの別DB復元検証を再実行する変更ではない。
- 最終buildでWeb・publisher・review・capture・readerの5プロセスの所有cwdと稼働を確認。不要になった古い生成export（fca14761／c0fada34）をBUILD_IDと未使用cwdの照合後に削除し、現在export／直前fallback・DB dump・モデルは保持。Cドライブの空きは確認時24.8GiB。
- 3200のTOP/公開APIは200、未認証の運営APIは401。HTTPS βは実Chromeで確認。Python urllibからのHTTPS要求はedgeの403であり、アプリの認可試験としては数えない。

## 残件・引継ぎ

U6全体は未完了。次はEntity同一性の候補と安全な適用方針、Chatパッケージの取込・再送／部分不備／訂正、二つの実テーマとThemeなしを含む総合一巡。U6の基本残りは2回程度を目安に再見積もる（推定。設計・実検証の結果で変わる）。U7の旧KG横断・統合受入、U8の正式配置は別工程。

今回、AIによる新定義の自動提案／適用・Entity統合・通常検索の旧KGと共通Recordの全横断UIを完成とはしない。iPhone実機、長期接続、大量の意味定義のUXは未確認。定義一覧は最大100版、同じ具体語の候補は最大5件、記録一覧25件・選択50件。選択は同じ画面内の保持で、ブラウザ再読込後の草稿復元までは提供しない。
