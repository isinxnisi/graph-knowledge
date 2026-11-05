# 共通の取得証明と新旧対象台帳（R1c）

2026-11-05。[再計画](PLUNODE_IMPLEMENTATION_REPLAN_20261105.md)のR1を進める実装。外部packageのHTTP受付・専用資格・自動配送は未実装。全データの列挙基盤と、自動で候補を生成・確認・適用するR2は区別する。

## 取得証明

知識DBの追加migration `007-acquisition-inventory.sql` に、`source_acquisitions` と `source_acquisition_links` を追加する。会員DBだけの審査結果に資料比較を依存させない。

- 観測は、サーバーが照合したrequested／final URL、原本／抽出本文／引用hash、抽出方式、確認時刻、policy、共通操作receiptを保持する。
- 原Source版と引用、Record版は変えず、証明との対応を別に保持する。URLが似ていること、同じ抽出本文であること、支持確認済みであることを同一視しない。
- 会員の最終受理と収集の最終登録は、共通原本の操作と**同じ知識DB transaction**で証明を保存する。失敗時に原Recordだけが残らない。
- 収集では保存済みbody・抽出本文のhashを再検査し、実際の引用と一致することを再確認する。外部から来たhashや「確認済み」の自己申告をこの関数へ渡すAPIは設けない。
- 比較で使う本文hashは、対象の固定Record版とSource版に結び付き、現在も公開可能なものだけを読む。停止した資料・未公開版・無関係な観測を比較の根拠にしない。単なる台帳の存在を公開権限にしない。
- 追跡parameter・URL表記・別URLで同じ本文が再提出されても、会員受理の資料比較は共通台帳を参照して既存Recordを再利用する。収集が登録した証明も会員側から比較できる。
- 重複で採用しなかった資料の観測も操作に残すが、元SourceとのURL／引用対応を確認できない観測を、勝手にそのSourceの証明にしない。

既存の公開済み会員decision／適用済み収集receiptは、共通のoperation入力・結果との一致を検査して移す。収集は保存原本から証明を再構成する。新たなHTTP取得やAI呼出は不要。再実行は同じ証明を増やさず、元Record・Source・Theme・会員の状態を変更しない。

資料比較を全経路で終えたわけではない。収集の意味重複判定と外部取込の正規化・最終受理はR1残件／R3で共通化する。本文の証明とAIによる事実支持判定は別の契約のままとする。

## 全データの列挙

`target_inventory_runs` と `target_inventory_entries` に、origin別の全件列挙と内容版・状態版・hashを保持する。

- commonはEntity／Record／Source／Theme／Mappingを、旧public KGはEntity／Claim／Sourceを全件たどる。最初の数十件や、会員から参照された旧KGだけを全体として扱わない。
- commonと旧KGのID・版体系を一つに潰さず、originを保持する。commonに参照済みの旧IDがあっても原本を重複投入しない。
- 1ページ最大500件のkeyset方式。台帳へ保存した継続位置から再開する。最大500件を全データの件数制限にはしない。
- 全件完了するまで読み取り用の確定台帳として渡さない。部分取得の残りを「削除された対象」と判断しない。
- commonは変更sequence、旧KGは公開dataset版をページごとに照合する。途中で変わった世代はstaleにし、別世代でやり直す。commonのページ取得は原本変更との共通lockを使う。旧KGは読み取り専用。
- 非公開・停止状態も台帳で区別する。`eligible` はその対象の公開状態の入口判定であり、依存対象・本人・資格・現在版の最終認可を代替しない。R2で外部送信・適用の直前に再検査する。
- 内部service／CLIであり、会員や匿名閲覧者へ未公開対象の一覧を返すAPIではない。AIに任意のDB操作を渡すものでもない。

ここまでで対象の全件列挙はできるが、周期実行・候補生成・原資料確認・自動整理は未接続。任意管理画面やこのCLIを人が毎回操作する運用で初版完成とはしない。

## 明示migration・再開

既存のprivate runtimeを引き継いだ環境で、Node24を使う。秘密値をshell履歴・URL・出力へ貼らない。

```sh
node --import tsx scripts/knowledge-inventory.ts migrate
node --import tsx scripts/knowledge-inventory.ts backfill
node --import tsx scripts/knowledge-inventory.ts scan
```

`migrate` 前には現行のbackup・別DB復元・再実行検証を行う。既存の適用済みSQLを変更しない。`backfill` は既存の公開receiptを読み、`scan` は両originの全件台帳を作る。どちらもKG・原記録・会員・Capsuleの変更／公開を行わない。途中停止からの再開・再実行は安全な設計とし、不一致を成功扱いで飛ばさない。

[実測・配置・制約](../verification/KNOWLEDGE_R1C_ACQUISITION_INVENTORY_20261105.md)に今回の件数と検証を残す。
