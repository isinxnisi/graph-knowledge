# 共通原記録 U1：実装・接続実証

2026-11-02。[採用した統合計画](../design/PLUNODE_PRODUCTION_INTEGRATION.md)のP0／U1を独立環境で実装した。設計は[共通原記録の契約](../design/KNOWLEDGE_FOUNDATION_U1.md)。本運用初版全体の完成ではなく、後続U2〜U6へ渡す正本・版・入力契約の実証である。

## 確認先と試し方

- [共通の記録](http://localhost:3276/themes/records)。既存の[テーマ一覧](http://localhost:3276/themes)にも入口を追加。
- 「仮想」で絞ると、画面から登録した「装画」の操作例が見える。
- 保存版Aは原記録の内容版2を反映、保存版Bは内容版1を保持する。同じRecord IDの参照であり、別コピーを登録したものではない。Bを開くと本文と関係語の差分を確認できる。
- 「記録を加える」から、テーマ名を付けずに根拠付きの関係・出来事・説明を登録できる。既存対象・資料の再利用は明示選択。URLのない資料は書誌で入力できる。

このPCの運営者確認画面。ユーザー知識投稿・実AI審査・会員Capsuleとの新断面統合はまだ接続していない。操作例は仮想と明示し、本番データへ投入していない。

再起動後の再開はPowerShellから次を実行する。既存の専用設定とvolumeを使う。

```powershell
wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/scripts/issue75-preview.py start
```

`status`で状態確認。コード更新時だけhold取得後に`stop`→`build`→`start`。Neo4j実証コンテナは停止しており、この画面の閲覧には起動不要。

確認中のproduction build：`ngdVDrRMD5Ifz8xktcFWp`。型検査を含めて成功し、3276で起動した。

## 実装した境界

Entity／Source／Recordの追記版、Themeの版付き参照、時間注釈IDと年表構成、独立した意味対応版、原入力・操作結果・投影依頼を追加した。検索は検証規模の全件照合で、公開検索の索引とページングはU2に残す。

収集側の新規bundle登録と、利用者の直接書込拒否を操作主体で分ける。今回のHTTP APIはサーバー固定のlocal operatorのみ。任意のroleや収集元を本文に書いて審査を迂回できない。collectorの実job認証・許可範囲・本番API pollはU6、利用者の審査中・修正・通知はU5の対象。

SourceはEvidenceのidと版へ固定する。資料だけ新版になっても、過去の引用箇所を新版の支持に差し替えない。確認状態も内容版と照合し、訂正時は未確認に戻す。公開したことのない過去版を、後に同じIDの別版が公開された理由で読めるようにしない。

差分表示には変更フィールドを出す。本文が同じでも関係語が変われば分かる。更新時は差分で観測したtokenを照合し、その後の未読変更があれば409で止める。保存中はフォームを操作不可にし、応答で途中入力を消さない。

## 検証結果

- 共通モデル・実PostgreSQL：22件（domain 7、実PG 15）。新規登録、二つのTheme、Entity固定版、根拠固定版、意味対応、同時再送、rollback、古い期待版、差分後の競合、private旧版、確認状態、非表示、操作主体、旧ID対応、migration再実行を確認。
- 既存年表・Capsule周辺とlegacy adapter：12ファイル141件（既存136＋adapter 5）。今回合計163件。全リポジトリの全試験を実行した意味ではない。
- 変更TypeScript／TSXのESLint、型検査を含むNext production buildを実施。
- 実ブラウザ：テーマなし登録、新しい具体関係、URLなし書誌、二つのThemeへの選択、原記録の訂正、差分表示、一方だけ反映、他方の旧断面保持を操作。
- 実KGのBILLY BAT記録では、ストーリー共同制作・ISBN刊行物範囲・具体資料へのリンクを画面確認。仮想記録では表示停止→復帰でも内容版2と保存版Bの内容版1を保持した。
- スマホ幅390×844：一覧が内容を押し下げる状態を確認し、選択後は一覧を小さく畳んで内容を読めるように改善。入力項目は一列、一覧は明示的に再展開できる。実機iPhoneのキーボードは未確認。

HTTP境界とTheme参照の16項目は[scripts/test-knowledge-preview.py](../../scripts/test-knowledge-preview.py)で成功。[HTTP結果](../research/issue75-foundation/http-results.json)。残した操作例のA=版2／B=版1を前提に検証するので、利用者がこの例を変更した後は同じ状態を再準備する。初回は検証コードのHTTP header大文字小文字扱いを修正し、レスポンスの大小文字に依存せず確認した。

実画面：[PC](../research/issue75-foundation/knowledge-u1-desktop.png)／[390幅](../research/issue75-foundation/knowledge-u1-mobile.png)。スマホ幅で横はみ出しなし、ブラウザconsole error 0。根拠なしの事実をAIが認定する試験や、人間の登録所要時間の測定は今回行っていない。

## 実KGと復元・再投影

既存公開artifactの1,931 Claimから、異なる関係を含む6 Claim／12 Entity／8 Source／8 Citationを抽出。[実sample](../research/issue75-foundation/legacy-sample.json)に元release・hash・Claim IDsを記録し、原パッケージの選択行と完全照合した。

共同制作とISBN刊行物範囲、Visitorと期間、会議議長と複数資料、影響、監督、著者を含む。typed値・出所は原payloadにも保持する。引用本文が保存されていない資料から架空の抜粋を作らず、Event開催期間を人物の参加期間へ転記しない。旧typed検索条件の新DTOへの全面接続はU2に残る。

- 旧Claim→Record@1対応は、新Recordの訂正後も不変。
- 11表を別DBへ復元し、全行の内容hashが一致。
- 追加migration `knowledge75/001-records.sql`の再適用無変更とchecksum相違拒否を確認。checksumは`efa53919c3529edb48b5ae1ef5ffb10b77716a81773a42af8be404f02fe87e69`。既存会員migrationは変更していない。
- 復元DB内だけで訂正・非表示し、独立Neo4jで世代切替、旧世代保持、失敗時active維持、再送不変、PG原記録からの再投影を確認。
- 成功した一巡の実測は176,697 ms。小さい検証量の処理・DB復元・制限したNeo4jの起動を含み、登録処理の応答時間や本番性能を示す数値ではない。

実証結果：[機械可読記録](../research/issue75-foundation/proof-results.json)。再実行は`scripts/knowledge-foundation-proof.ts`。専用private設定とDBを必要とするため、コード中の対象・label・名前guardを確認して実行する。

初回は新Neo4jの起動待ち上限、2回目は並行した意図的なUI書込による最終hash差分で未完。書込を止めた3回目で全項目成功した。未完ログは`.local/issue75/knowledge-proof/attempt-1/2-…-report.json`に別保存し、成功で上書きしていない。

復元先`plunode_knowledge75_restore_1793548916851`は保持。Neo4j `plunode-issue75-p0-neo4j`は停止・volume保持。既存Neo4jを使って実証したものではない。

## 保全・配置と次工程

作業前dumpは`.local/issue75/u1-before.dump`、SHA256 `8d8642ad51c7af9033a4e1d5fb20609cc906449bedd3026a818d6da62bc22e25`。元の16テーマ・18 Capsule・9共有と意味定義のhashが作業後も一致した。[保全結果](../research/issue75-foundation/preservation-results.json)。新schemaへ実6記録と仮想操作例を追加するだけで、旧theme75の保存内容は移行していない。

反映先は独立3276のみ。main・3200・HTTPS β・本番・旧収集Worker・Kev・AI教育・日次予定は今回更新しない。本番の会員・KG・認証データは持ち込まない。Autopilot reviewは未反映0、共通hold/token下で実装・検証し、日本語commitと通常push後にholdを解放する。

次はU2で公開検索・新Graph DTO／投影と公開世代をサービスの読取経路へ接続する。U3の既存探索との往復、U4の新origin／断面・会員Capsule・年表共有、U5のAI審査、U6の有限Workerは未完。時間注釈はRecord内容版内に安定IDを持ち、注釈単独の別revision tableは今回作っていない。現段階を本運用初版全体の完成としない。
