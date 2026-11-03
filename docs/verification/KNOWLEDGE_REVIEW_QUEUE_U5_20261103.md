# U5途中：永続AI確認・利用枠・本人結果

2026-11-03。[現行契約](../design/KNOWLEDGE_SUBMISSIONS_U5.md)。今回の範囲は、本人が明示した受付版→永続job→Gemini→項目ごとの結果→編集・取消。原資料との一致確認・同一性・通常自動受理・公開／通知／異議対応は次工程で、U5全体の完了ではない。

## 重要な判断

- 非公開のjob・送信断面は会員DBの追加021へ置き、公開知識DBに未受理投稿を置かない。既存000〜020、共通知識001／002と先行試験003のchecksumを保持する。
- 無料APIの条件に合わせ、明示的な送信依頼と指定β本人に限定する。過去の受付や取消済み試験をbackfillしない。会員情報や未選択の断面を外部へ送らない。
- 処理中・無料枠待ち・通信結果不明・AIによる補足依頼を分ける。原資料の照合待ちを、審査通過や公開と表示しない。
- 取得済み応答からの状態更新と新たなAI再推論を分け、予約・wire hash・モデル・policy・入力版を保存する。送信は最大3回、欠測usageは0ではなく予約を残す。
- 先行評価CLIの63回を同projectへ一度だけ取り込む。DB側と旧ファイル台帳を並行使用して残量を二重計算しない。導入後の旧live評価は拒否し、offline再採点は維持。
- 0.8Bは任意のヒント。警告・失敗・無視が受付や後段の判定を変えない。共有serviceの変更・停止はない。

## 検証と配置

実装時の使い捨てPostgreSQL／実テストOIDCで、本人分離・二重lease・受付版固定・再起動・受信済み応答の再利用・消費不明・Retry-After・利用枠予約・旧評価取込・項目別結果・停止／退会消去を確認する。ブラウザの実Google、実API送信、fixtureは分けて記録する。

型検査・変更対象ESLint・対象単体/UI 30件・使い捨てPG/OIDC結合20件が成功。単体試験の初回指定は`.local`の旧build試験まで拾ったため、除外指定を付けて現在の5ファイルだけを再確認した。Node起動方法は子も`process.execPath`へ揃えた。

main／3200／HTTPS βへ反映済み。アプリsource `47edee25487dd1af7cbb67c382850ab4c825966c`、build `GJ7mk18LdwHfmYRSA7VRw`。作業branchは`codex/issue75-theme-foundation`、mainへfast-forward、両branchを通常pushした。最終記録は文書だけの後続commitで、アプリの再buildは行わない。3276はU4を維持、本番VPSは更新していない。

- 確認先：[知識の投稿](https://graph-beta.isinxnisi.com/member/submissions)。既存の実Google本人1人が対象。「知識を書く」→内容・根拠→草稿保存→任意のヒント→外部送信確認→AI確認。結果は受付版ごとに残る。指定外の会員は従来の受付だけで、無料APIへ送信しない。
- fresh backup：private `.local/u5-review/member-before-review-ed18105285ea/database.dump`、SHA256 `d5d6ba444b1eb59e3ce8bf8f42c93b209308641303d8e70d5a8660ff505d179d`。同じWeb role `gk_member`をownerとする別DBへ復元し、既存38表の行fingerprintを全照合。021の予行・再実行・live適用・再実行でも旧行／checksum不変。ledgerは000〜021の22件。知識DB001／002は変更せず、知識003は適用しない。
- 先行評価63回を台帳へ一度だけ取り込み、過去受付の新規jobは0件。既存private runtime・Google認証と依存を維持し、秘密値や私有DB内容をGit／公開記録へ含めていない。両投稿APIのruntime traceに021を確認。
- ローカルHTTP：匿名の投稿API401、公開知識status200、operator用`/api/knowledge`と`/api/themes`404。HTTPS βの実会員画面では保存・API・結果の自動更新が成功。先行する匿名Python HTTPでのCloudflare403は、実会員ブラウザの結果と混同しない。

## 実Google・実AIと画面

既存Google sessionで`U5確認｜AIの項目別チェック`を直接入力し、公開[NASAの打ち上げ記録](https://science.nasa.gov/mission/webb/launch/)の根拠を添付。正常な2021年12月25日の項目と、意図的に2022年にした検証項目の2件を、実際のUI経路で保存・受付した。アカウント情報・秘密情報は含めていない。

- 0.8B任意ヒントを実UIから1回呼び、正常項目へ「気になる点なし」が返った。指摘へ従う強制はない。警告／障害時も先へ進めることはUI／結合試験で別に確認した。共有Kevの設定・コンテナ・モデルを変更／停止していない。
- Geminiは2回、各項目1回で応答。正常項目は`reviewed`（公開前の照合待ち）、年が矛盾する項目は`needs-changes`へ分かれ、日本語の理由が画面へ自動反映された。原資料の本文を自動取得・照合した結果ではなく、渡した抜粋と主張の評価である。
- 送信wireに所有者UUIDと私有の投稿タイトルが含まれないことをDBでも確認。原記録のkind／関係方向・肯否・範囲・時期と、該当する資料の箇所／抜粋は送る。未選択のCapsule全体は送らない。
- 入力修正中は「変更前の受付内容への結果」と区別し、破棄で戻した。reloadして同じ受付版・結果を再訪。取消のinline確認を経て検証投稿を取り消し、保留job0件・追加AI送信0件を確認。取消後も本人は過去の結果を読める。公開正本・KGへの書込は0件。
- PC幅と390×844のChrome viewportで実操作・目視。スマホの文書幅380／scrollWidth380で横溢れなし。補助UIの固定行を追加せず、結果・送信確認は通常本文内。viewportは解除。ブラウザerror logは今回確認時0件。iPhone実機・ソフトキーボードは未確認。
- proofは開発PCのCodex visualizations配下`u5-review-beta-desktop.png`／`u5-review-beta-mobile.png`／`u5-review-beta-cancelled.png`。最終の確認タブは取消済み結果として保持した。

## 実送信量・運用条件

| 今回の項目 | prompt実測 | candidates実測 | total実測 | thoughts／cached |
| --- | ---: | ---: | ---: | --- |
| 正常 | 337 | 52 | 389 | 欠測 |
| 年の不一致 | 341 | 59 | 400 | 欠測 |

今回計2送信、prompt678・candidates111・total789。thoughtsが欠測なので出力全体の精算は確定せず、各2048、計4096の出力予約を保持する。評価分込みで台帳65送信、LA基準の当日37、月65。欠測input4回分12675、月次の欠測output予約133120を保持している。既知のcandidatesと不明な推論を混同しない。

ローカル設定はRPM15、TPM30000、日次80回／月次2400回、日次入力250000／出力160000、月次入力7500000／出力4800000。project単位で原子的に予約し、APIkey追加で上限を回避しない。正確なprovider残量・他経路からの利用はローカルだけでは保証できない。[Googleのrate limits](https://aistudio.google.com/docs/rate-limits)と[無料APIの利用条件](https://aistudio.google.com/docs/terms)に従い、指定β本人・公開予定の知識のみを明示依頼する。一般解放・課金・有料fallback・追加AI接続は今回行っていない。

## 試験の区別と途中の失敗

最終の単体/UIは現在ソース5ファイル30件、使い捨てPG／実テストOIDCは20件。二重lease、改訂との競合、結果不明／受信済み応答からの復旧、Retry-After、3回上限、停止／復帰、退会による送信断面消去と匿名利用枠保持、別DB全45表の復元・再実行を確認した。これは実Googleで本人のアカウントを退会させた検証ではない。型検査・変更TSのESLint・型検査込みpublic buildも成功。

初回は古い子Nodeの起動、試験用OIDCで未定義のidentity、使い捨てDBの一過性起動失敗があった。起動は`process.execPath`へ揃え、fixtureを既存identityに修正した。使い捨てDBの起動失敗は原因未確定で、当該試験のcleanup後の再実行が成功した。共有Docker／Kevの再起動は行っていない。試験指定が旧build配下まで拾った回は除外指定で現在の対象へ絞り直した。これらを製品経路の成功と混同しない。

今回のソース修正・関連検証を一つの単位にまとめ、β用buildは1回。実UI検証後のコード修正・追加buildは不要だった。

## 後続

原資料と抜粋の照合、参照の現在認可と同一性、通常の自動受理・公開検索／図・通知・補足／異議を接続する。会員DBと共通知識DBを跨ぐ原子性は単一SQL transactionでは成立しないため、固定decision ID／公開receipt／outboxの再送収束を実証する。一般の新規アカウント・地域／年齢条件への解放は今回していない。

今回も必要な認可・移行・競合テストを省略せず、関連修正を一つの経路にまとめて検証してからβ用buildへ進む。途中の試験失敗と最終結果は区別して残す。
