# 投稿対象変更・読み取り表示・色の同期

2026-11-04。利用者が根拠追加の対象を選び直すと、一覧の対象と図の接続が一致しなくなる問題と、入力できない欄が入力欄に見える問題を修正する。

## 原因と変更

- 参照contextは候補を選ぶたびに蓄積するcacheだが、その全Entity/Recordを表示していた。現在の項目が参照する範囲に絞る。
- Cytoscapeのsource/targetは通常のdata更新で変わらない。同じ辺IDの両端変更で既存辺を置換し、選択を再適用する。投稿previewの構成変更時だけ表示範囲を収め直す。
- 投稿の青指定が後続の既定edge/選択styleで上書きされていた。投稿styleを後へ置き、凡例と線・番号badgeを同じ色変数にする。KG badgeは中立色。線幅は通常1.7、選択2.2で、通常の選択線4より抑える。
- 元の事実、変更しない矢印名・限定・時期、既存の根拠は静的な内容として読む。既存quoteが空の場合に入力例を出さない。新しい資料にだけ普通の入力欄を使う。
- 対象変更を項目内で通知し、本文・追加資料の再確認を促す。検索結果の内部ENUMを、図と同じ人向けの関係名へ変換する。
- 根拠追加／訂正から操作を変えたら、元の知識由来の本文・限定・時期・根拠を引き継がない。本人が書いた文・追加した資料は残す。保存済み利用者草稿の一括書換えはしない。

## 機械検証

関連する一意の55ケースが成功。PostgreSQL専用接続を要する6ケースはこのUI修正では起動せずskip（追加migrationなし、liveの保全照合は別途実施）。実Cytoscape headlessの接続先・古い辺の切断・色と選択幅、古い参照cacheからの表示除外、操作変更時の入力保持、read-only表示、候補の表示名などを検証。初回の小幅な選択線のテストで、辺置換後に選択classが落ちる問題を検知したため、content変更時も選択を再適用して修正し、Canvas全23ケースが成功した。対象ESLint成功。最終のwebpack production buildと全TypeScript検査も成功。時期入力のテストに誤ったtesting-library optionがあったため型検査で直し、草稿の未完成入力を拒否する旧テストは、現行の「保存可能・公開時には拒否」という契約へ合わせて公開schemaの厳密性を検証した。

## 追加指摘への対応

テーマ選択を閉じた後のvalueなし状態にも再検索buttonを残す。対象が解除された場合は検索を開き直す。訂正は取得した「訂正前の内容」と「訂正後の内容」を分け、未選択時の次の操作を示す。「任意」と重複する「必要なときだけ」を入力例から除く。複数時期を番号・細い区切り・右上の個別削除でまとめる。

公開に資料がないときの `Too small: expected array to have >=1 items` は、公開Recordの検証結果をそのまま表示していたもの。項目番号と必要な資料追加を日本語で案内し、資料なしの草稿保存を保持する。保存版の再読込は409競合時だけに限定する。UIテストで、資料なしの保存→公開依頼の事前検証、未送信・入力保持・再読込buttonの非表示を確認。実更新競合では回復buttonが現れ、未保存入力を保持する。

## 実環境確認

Chromeの実GoogleログインでHTTPS βを操作。本人が入力中の既存草稿に触れず、専用草稿「【確認用】対象変更と図の同期・公開しません」を使った。

- 2項目の根拠追加で、NASA関係→Lucia Trozzo→University of Tokyo→宮川治→University of Tokyoと選び直し、旧Entity・旧関係が消え、別項目の長崎尚志→MASTERキートンの関係を保つことを確認。草稿の保存・再読込でも一致した。
- 根拠追加の元の事実にtextareaがなく、既存引用が空なら「原文は登録されていません。」と読める。新規資料には入力できる。操作を出来事・背景へ変えると元の事実・資料を外し、本人が追加した資料は保持する。
- 訂正へ切り替えた直後に検索が見え、公開NASA記録を選ぶと「訂正前の内容」と入力可能な「訂正後の内容」が続く。先に書いた文を保持し、既存参照を更新する。
- 追加先Themeの選択→解除→「テーマを探す」→再選択に成功。再検索中は候補の読み込み待ちとなり、完了後に選択できる。
- 時期を2件追加し、時期1だけを外すと時期2の日付が残って番号が繰り上がる。PC／390×844で区切り線は1px、横overflowなし。各時期の右上に個別削除がある。
- lightの凡例／操作badgeは共にrgb(40,116,184)、dark-brownは共にrgb(125,184,234)。後者の文字色はrgb(21,36,50)。明暗の見た目を確認して元のlightへ戻し、viewport overrideも解放した。
- 資料0件の専用草稿を保存後、公開操作を試すと日本語の事前エラーが現れ、再読込buttonは0個、本文は残る。依頼・AI実行・知識公開には進まない。チェックを外した。前の成功案内や入力エラーを次の操作へ持ち込む点も実操作で検出し、状態の境界で閉じるよう修正した。

実機iPhoneのキーボード／Chromeスクロールは今回未確認。390px幅のChrome検証と区別する。AIの判定品質・公開フローそのものは変更せず、U6の残工程を完了した扱いにしない。

最終版では、資料不足エラーだけが表示され、前の成功通知を持ち越さない。取消確認にも入力エラーが混ざらない。専用草稿の取消時に初回応答を確認できず、通常画面の「同じ操作を再試行」で同じ要求を再送し、取消済み・一覧復帰を確認した。応答が確認できなかった原因の調査は今回行わない。本人の既存投稿は変更しない。

## 配置・保全・再開

- 最終app source `7f6ec682a22698aa5f725a40277f26f965b967cf` / build `xFCZOeokDcxMdG718u_IF`。
- 既存main・localhost:3200・HTTPS βへ反映。HTTPS βの本人ログインで上記を確認。3276・本番VPSは今回更新しない。
- ローカルHTTP：TOP 200、公開読取status 200、未認証の投稿API 401。
- 追加migrationなし。会員000〜028／ledger29件、知識001/002/004。適用済みchecksumを維持し、既存移行の再実行確認も成功。
- fresh backup `/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/submission-repair/activation-backup-20261104T140315Z`（private、member/knowledge custom dump）。旧dumpのlive上書きは行わない。
- 原記録26版・Theme5版・Capsule25件・会員migration ledgerのfingerprintは開始時と一致。認証／review／collectionのprivate設定hashも一致。共通Kev・KG・運営Connectorは未変更。
- webpack cacheは再利用するが、git archiveから3069個のtracked fileを最終SHAとbyte照合してからfull production build／型検査を実行。directory名は `submission-repair-f0245dfa` のまま、内容は上記最終source。稼働`.next-public`は別copy。
- 確認先：[知識の投稿](https://graph-beta.isinxnisi.com/member/submissions)。未保存の入力がある場合は草稿へ保存してからreloadし、新しいclientを読み込む。
- 再開は[段階β runbook](../runbooks/KNOWLEDGE_BETA.md)の既存launcher／private profileを使う。DB生成・seed・volume削除で復旧しない。

画像は開発PCのCodex検証資材ディレクトリへ保存：`submission-correction-before-after.png`、`submission-time-groups.png`、`submission-retarget-mobile.png`、`submission-validation-japanese.png`。明暗の線・badge確認は`submission-retarget-dark.png`など。利用者情報を含む画面画像そのものはrepoへ追加しない。

## 残る範囲

U6全体は未完了。同一性整理・Chat取込・実テーマ総合一巡、U7統合受入・U8正式配置は別工程。ここで修正したのは既存投稿の選び直し・読み取り区別・入力案内・時期区切り・エラーの文脈。AI審査品質や知識の自動受理の条件は変更しない。
