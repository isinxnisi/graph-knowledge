# U5途中：本人の投稿受付・Capsule選択・会員ライフサイクル

2026-11-03。[現行契約](../design/KNOWLEDGE_SUBMISSIONS_U5.md)。本人の草稿保存・版固定受付・編集・取消、保存済みCapsuleの項目選択取込を接続した。AIの永続job・原資料との照合・通常自動受理・公開・本人結果通知は次工程。受付をU5全体の完了と扱わない。

## 確認先と今回の範囲

日常確認先は `https://graph-beta.isinxnisi.com/member/submissions`。2026-11-03に3200／HTTPS βへ反映し、実Googleの既存sessionで操作を確認した。

1. ログインして「知識を書く」。説明・出来事・具体的な関係、範囲・肯否・時期・根拠を入力し、草稿保存する。
2. 再訪して「この版を受付」、または未保存の変更から「保存して受付」。今回は「AI処理の接続待ち」と表示する。
3. 編集して保存すると新しい草稿になり、旧受付をその内容へ付け替えない。取消は確認後に行う。
4. 「Capsuleから」で本人の保存文書を選び、項目を最大20件選択して取り込む。本人のCapsule下部「知識を投稿」からも別タブで入れる。元の文書・共有範囲を変えない。

一般投稿から公開正本へ書く経路はまだ無い。今回、実投稿をGemini／Kevへ送信しない。0.8B任意助言、Gemini通常自動受理という採用済み方針は維持し、全件人手承認へ変更しない。

## 主な設計・認可

- 非公開投稿は会員DBの `member_knowledge` へ移す。共通知識DBとは分離し、認証したownerの現在user行を同じtransactionでlock・再確認する。
- 追加migration `db/member/020-knowledge-submissions.sql`。既存000〜019、知識001／002／先行試験003は書き換えない。003は先行の隔離検証の再現用で、βへ適用しない。
- `submissions`、不変`submission_revisions`、版固定`submission_receipts`、ownerごとの冪等`submission_requests`。受け取ったJSON中の入力文字列を正規化前の値で保持し、正規化後の内容と分ける（HTTP本文の空白・byte列そのものの保存ではない）。
- Origin・session・active user・X-Member-User・本文stream上限を確認。owner／状態／collection権限を自己付与できない。他人と存在しないIDは同じ404、private no-store。
- CapsuleはID・保存版・選択keyからサーバーが本人の保存内容を捕捉する。古い版は409、同じ操作の再送は元の取得結果。未選択の自由メモ・関係・私有説明は含めない。
- 原記録／対象／資料の版、肯否・範囲・時期・具体語を保持。元記録は訂正候補として区別。作者noteやKG citationの解説を原資料の引用へ読み替えず、抜粋が無ければ空として補足可能にする。
- 停止はDB triggerで受付・草稿を取消。再開しても旧受付を復活しない。退会はuser FKで本文・捕捉断面・再送応答・receiptをcascade削除する。別DBへの消去の取りこぼしを作らない。
- 保存数・版数・容量・短時間の操作数／受付数を有界化し、操作制限中も取消できる。通信結果不明では入力を保ち同じ操作IDで再試行する。読取だけで日時・順序を変更しない。

## 検証

- 使い捨てPostgreSQL＋実テストOIDCで9試験成功。本人分離、別session／Origin、自己権限付与拒否、元文字列、同時再送／同時編集、受付後の再編集、Capsuleの版・選択捕捉、元Capsule不変、制限中取消、停止との競合、退会消去を確認。
- 同じ使い捨てDBをdumpし、別DBへ復元して38テーブルの行fingerprint一致、020を含む再適用で不変を確認。これはβの実会員DBでの退会操作ではない。
- 新UI7試験で一操作での保存＋受付、曖昧な失敗の同一操作再試行、未完成の資料を外して草稿保存、取消確認、アカウント変更時のprivate DOM排除、取得失敗を空履歴と誤表示しないこと、通常の保存中と通信結果不明の表示を分けることを確認。
- 選択捕捉3試験で取得版・肯否・範囲・時期・具体語、noteと引用の区別、不正・重複keyの拒否を確認。
- 既存Studioの回帰では矢印反転の1件が5秒timeoutになった。方向編集の実装は変更しておらず、対象を絞った再実行では3.424秒で成功した。他51件の成功と合わせて機能回帰を確認し、timeoutを成功扱いにはしていない。TypeScriptと変更TSのESLintも成功。先行prototype repositoryは11試験と12表の別DB復元・再適用で回帰確認した。βの実操作は下記へ追記する。

再検証は `.local/issue75/node node_modules/tsx/dist/cli.mjs scripts/test-member.ts --submissions`（PATHに同nodeのdirectoryを含める）。専用の一時PG containerだけを作り、終了時にそのcontainerだけを削除する。dumpは作業worktreeの `.local/u5-member/` に残す。実GoogleやiPhoneでの確認とfixtureを区別する。

## 配置・保全・残件

開始時main `c49a7f25`、作業branch `codex/issue75-theme-foundation` の `d799f785`。mainの未追跡memo.txtと並行作業を保持。無関係な自動開発候補を取り込まない。共通hold・token review／assertで変更・検証を保護する。

βの既存会員DBをfresh backup・別DB復元し、元の34表の行と000〜019 checksumを保ったうえで追加020を適用した。ledgerは21件、member_knowledgeは4表、再実行で不変。Google認証・Cookie・会員・Capsule・コミュニティ・通常KG・知識DB・AI artifactを引き継いだ。移行後のUI修正ではWebだけを更新した。本番VPSはU8であり更新していない。

U5の残りは基本あと2回程度の推定。永続job・利用量・0.8B任意助言・Gemini・原資料照合・自動受理transaction・公開／通知と、実会員の総合確認を接続する。今回の「受付済み」はAI審査通過や公開の意味ではない。

### 切替中に確認した問題

- 初回の別DB移行予行では、復元DBをpostgres所有にしたため実際のWeb roleからpublic schemaを使えず停止。実DBへの適用前に既存Webを復帰した。復元DBのownerとpg_restoreのroleを実物と合わせ、Web roleの権限を広げず再検証した。
- 続く予行では検証scriptのSQL文字列が誤って3引数となって停止。修正後、34表の保全・移行・再実行が通った。実DBを旧dumpで上書きする復旧は行っていない。
- 最初の新Web buildは通ったが、実ブラウザの認証付き一覧でmigrationファイル参照が失敗した。webpackのnew URL変換を避け、実行cwdのdb/memberからchecksumを読む。取得失敗時に「投稿なし」と誤表示しない修正も加えた。修正版の配置・実操作結果は以下へ追記する。

### 最終操作で追加した修正

- 通常の保存中に結果不明の再試行案内が一瞬出る状態を分け、処理中は保存中表示、結果不明のときだけ同じ操作の再試行を示す。追加UI試験で遅い保存と結果不明を区別した。
- Capsule候補で相手がない出来事に余分な矢印を出さない。
- My Capsulesの作業面だけでなく、通常のアカウント内Capsule閲覧にも知識投稿の入口を渡す。現在の本人保存文書だけを対象とし、過去版・無効flag・共有閲覧には出さない。
- 表示条件の型エラー1件は配置前のbuildで検出し、unknownのpendingを明示的な真偽値に直した。会員UIの追加fixtureも、local nodeをKG参照IDへ混在させたため失敗し、参照を空にした適正fixtureへ修正した。既存13件と追加1件の全14件を成功確認した。失敗buildや試験のtimeoutを成功結果へ数えない。
- 実操作後の修正は別directoryの固定source buildで作成した。一部の途中buildは追加修正のため自分のbuild processだけを中断した。稼働βはこの間も前の互換Webで稼働し、最終Web切替に追加DB移行はない。

## 最終配置と実ブラウザの確認結果

| 確認先 | 状態 |
| --- | --- |
| localhost:3200／HTTPS β | source `fe40dd54272599422fb3c7f7cc59c7e11da30526`、build `givEVGjRrzqDqmfBrJTyE`。既存public runtimeで稼働 |
| 3276 | U4の隔離確認Webを保持。今回は更新していない。本人受付はHTTPS βで確認する |
| 本番VPS | 今回更新していない。U8の別工程 |

最後のアプリbuildは別directoryで74秒compile・94秒TypeScript、静的生成・route traceも成功。API traceの020同梱を照合してから約6秒のWeb切替処理で配置した。build時間・SQL・公開正本を同期要求の保存待ちへ入れていない。以後の記録のみのcommitでは再buildしない。

- 直接入力：仮想と明記した1項目を草稿保存、reload再訪、版1受付、内容の年を訂正して版2草稿、版2再受付、取消まで実施した。DBでは両receiptのdigestがそれぞれの内容版と一致し、版1の2003年と版2の2004年が保持されていた。
- Capsuleから：本人の `U4確認｜Webbの年表と共有` 保存版4の11候補から2項目だけ選び、草稿へ取込。タイトルを変えて保存＋受付、取消まで実施。両端・具体語・資料版・箇所・範囲と2件の時期が保持され、元Capsuleの版4とupdated_atは変わらなかった。
- 通常のアカウント内Capsule閲覧：最終buildで「知識を投稿」のhrefが本人Capsuleの選択URL、targetが_blankであることを確認。My Capsulesの作業面と同じ投稿先へつなぐ。リンク先の選択操作は上記で確認した。
- 検証用の2投稿はともに取消済み。後続AI jobの対象にしない。新buildで本人一覧の再読込も確認し、読取前後でstate・内容版・状態版・updated_atのfingerprintは不変だった。
- PC 1920pxとChromeのviewport 390×844で確認。モバイルのdocument scrollWidthは380px、main幅348px、本文textareaは296pxまたは資料内270pxで16px文字、横overflowなし。viewportは通常幅へ戻した。iPhone実機・ソフトキーボードは未確認。
- 実Googleについては既にログイン済みの本人sessionを利用した確認。新規のOAuth往復・別の実Google利用者・実会員の停止／退会操作はしていない。認可分離・停止競合・削除cascadeは専用の実OIDC／PG fixtureで確認した。
- ローカルHTTP：ページ200＋BUILD_ID一致、匿名投稿API401、公開status200、operator側 `/api/knowledge` と `/api/themes` は404。3276も200。HTTPS βの最終実ブラウザDOMにも同じBUILD_IDを確認した。
- 匿名HTTPツールからのβ取得は最後にCloudflareの403を返した（原因未確定）。これはアプリの401確認成功とは数えない。認証した実ブラウザは同じHTTPS βで動作し、保護設定の回避・変更はしていない。

### 保全・復帰と原記録

fresh backupはprivate `.local/u5-intake/member-before-u5-backup-5443c9da666f/database.dump`。SHA256 `86efb0234358e263d0923fbf4064d83868ddb3b623b32dc9ca394fda51e81d77`。別DBへ実復元し、34既存表の行一致・実Web roleでの020移行・再実行不変を確認してから実βへ適用した。live DBへ旧dumpを上書きしない。

private `.local/u5-intake/activation-final.json` が配置source・build・backup照合結果を保持する。`browser-data-proof.json`／`browser-final-baseline.json`／`http-final-proof.json` は本人操作の版固定・取消・読取不変・HTTP結果。秘密値を含むruntime-before.jsonやdumpをGitへ追加しない。直前の互換Web（source df8e7630／build N1ymTc24Sm0u7-0lQ6UAQ）は `.local/u5-intake/compatible-build-N1ymTc24Sm0u7-0lQ6UAQ-*` に保持した。U4以前へ機械的に戻さない。

再開は共通hold・token確認後、空いている3200に `python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node`。private beta-knowledge.jsonの受付flagと既存の認証設定を再利用する。稼働中なら停止せず拒否する。DB初期化・seed再投入は不要。トンネルの再開は既存[runbook](../runbooks/KNOWLEDGE_BETA.md)に従い、他connectorをまとめて変更しない。

### 後続へ残すもの

0.8Bの任意助言、永続job／試行／lease・無料枠予約精算・Gemini、原資料と抜粋の照合、通常自動受理・公開／通知が未接続。受付成功は審査通過でも公開完了でもない。今回のAI実送信は0。全件人手承認へ戻す方針変更もしていない。

次は[U5の後工程への注意](../design/KNOWLEDGE_SUBMISSIONS_U5.md#受付から後工程へ渡す際の注意)を読み、取消済み・古い受付・外した項目・私有断面をAIや公開へ混ぜない。会員DBと共通知識DBを単一SQL transactionと誤認せず、decision／receipt／outboxの二段階の収束を実証する。U5の残りは基本あと2回程度の推定で、原資料取得・外部送信条件・受理境界の不成立があれば増える。U6・U7・U8の範囲を今回完了にしない。

通常push先はmainとcodex/issue75-theme-foundation。最後は記録だけの日本語commitを両branchへ反映する。mainのmemo.txtを保持し、自動側未反映0・dirtyなしをtoken reviewで確認。無関係な候補の取り込みや一括acknowledgeは行っていない。共通holdの解放結果は作業の完了報告へ記載する。
