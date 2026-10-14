# 明示クレジットのRole対応

2026-10-14。ユーザー依頼に対する実装候補。制作Roleの3定義と広いClaimを保持する方式はユーザー明示承認済み。10件の3200/Tunnel・VPS反映も明示承認済み。実際の適用結果は公開β進捗へ記録する。元の公開release／収集台帳／凍結datasetは変更しない。

| 人物 | 作品 | 追加限定 | 根拠 |
| --- | --- | --- | --- |
| 浦沢直樹 | PLUTO | 著者 | 国会図書館書誌「浦沢直樹 [ほか]著」、第1巻ISBN一致 |
| 浦沢直樹 | MONSTER | 著者 | 国会図書館書誌「浦沢直樹, スタジオ・ナッツ 著」、完全版1 |
| 浦沢直樹 | 20世紀少年 | 著者 | 国会図書館書誌「浦沢直樹 著」、完全版1 |
| 浦沢直樹 | MASTERキートン | 著者 | 国会図書館書誌「浦沢直樹, スタジオ・ナッツ 著」、完全版1 |
| 浦沢直樹 | BILLY BAT | 著者 | 国会図書館書誌「浦沢直樹 著」、第4巻 |
| 浦沢直樹 | パイナップルARMY | 作画 | 小学館商品情報「画」、文庫1 |
| 浦沢直樹 | YAWARA! | 作 | 小学館商品情報「作」、文庫1 |
| 浦沢直樹／長崎尚志 | MASTERキートン Reマスター | 著者（各1 Claim） | 小学館商品情報、それぞれ「著」 |
| 手塚治虫 | 鉄腕アトム（漫画） | 作画 | 公式掲載の本人制作回想「描いています」 |

追加10 Claim／5 Source／10 Citation、Entity追加0。合計2,109 Entity／1,844 Claim／1,751 Source／1,880 Citation。旧広いClaimを残すためClaim数は増えるが、DisplayRelationと接続Entityは増えない。同じSourceの再利用は新しい独立根拠ではない。

国会図書館のOpenSearchをISBNで照合し、責任表示・書誌URL・取得日の最小メタデータだけrawへ保持する。書誌確認であり原本実見ではない。名前・本文・絵柄からの推測ではなく、資料の著／作／画を区別する。原資料の他の人・組織は自動生成しない。新規5 Sourceは国会図書館、その他は確認済み公式Sourceを再利用する。

PLUTOの出版社表記だけは「浦沢直樹×手塚治虫」なので作画へは変換しない。追加の書誌責任表示で「著者」までを支持する。手塚治虫→PLUTO、原作Role、作品派生は追加しない。工藤かずや→パイナップルARMY、両作者→信長は原資料の分担が明示されないため広い関係を維持する。9 Claimのpublication scopeはクレジット確認の適用範囲で、当該巻だけ・全巻全版・全期間の担当ではない。本人回想から十五年間のClaim.periodを生成しない。

生成: `python3 scripts/prepare-contribution-credits.py [--check]`。

隔離DB＋本番image＋実ブラウザ: `docker build --target web -t graph-knowledge-web:beta-credits-20261014 .` の後、Node24で `npx tsx scripts/test-contribution-credits.ts`。7695／3216だけを使用し、終了時に専用containerとnetworkを削除する。公開3200／VPSと会員PGは変更しない。

公開反映にはRole意味レビュー、件数とKG-only backupの確認、および新Role対応Web／operatorの更新を先に行う。古い4 Role版Webへ新KGを投入しない。Role投入後に古いimageへ戻す場合は、新operatorでKGを事前backupへ復旧してからWebを戻す。会員PGを巻き戻さない。

`ledger.json` のpending表記は収集時点のスナップショット。後続の人間受入は公開releaseの `acceptance.json` に判断者・境界・artifact hashとともに記録し、収集記録を遡って承認済みに書き換えない。
