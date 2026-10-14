# 作者クレジットをGraphで読めるようにする

2026-10-14。ユーザーが3 Role定義と広いClaimを保持する方式を明示承認。既存のCONTRIBUTED_TOと一Claim一Role、刊行物scope、Claim identityを維持する。表示専用のCitation.note解析は行わない。

## 追加する三つの限定（人間意味レビュー済み）

| ID／表示 | 支持する狭い意味 | 認定しないこと |
| --- | --- | --- |
| AUTHORSHIP／著者 | 資料が本人を対象作品・刊行物の「著」「著者」として明記 | 原作、脚本、作画、単独著者、著作権者への読み替え |
| CREATION／作 | 原資料の「作」クレジットとして制作に関与 | 「原作」「脚本」「作画」「著者」との自動同一視 |
| DRAWING／作画 | 漫画の「画」「作画」の明示、または本人による当該漫画を描いたという明示 | 原作・脚本・著者の兼務、各版・全期間への一般化 |

CREATIONの英語表示は `Creation credit (作)` とし、曖昧な「作」をWritingへ翻訳しない。AUTHORSHIPは資料上の著者クレジットであり、創作内容のすべてを担当したことを認定しない。DRAWINGは今回漫画の画／作画に限定し、監督・原画等を自動的に含めない。

各RoleはCONTRIBUTED_TOの限定であり、新predicate／自由qualifierを導入しない。新Roleの適用には原表記・language・Source・locator・scopeの確認を必要とする。著者欄に名前があるだけで具体的職分が分からない記録は、より明示的な資料がなければ旧fallbackを維持する。

## 保存・比較・表示

公開済みの広いClaimのUUID・限定を書き換えず、新しいRole付きClaimとCitationを追加する。同じSPOのDisplayRelationへまとめ、Graphは既存の「制作」badge＋Role名を利用する。旧Claim・同じSource由来の追加Claimは独立資料数の増加ではない。scope・肯否・periodの比較、条件のLIMIT前適用、cursor binding、URL・保存・復帰は既存のtyped処理を再利用する。

旧Role、凍結dataset、過去release artifactは不変。Role enumを拡張するためWeb／operatorの更新が必要で、古いWebへ新Role付きKGを先に投入しない。新releaseは20261014-pluto-001をbaseとする。公開反映前に件数・backup・復旧と人間受入を確定する。

## 資料と保留

小学館のパイナップルARMY第1巻は「画」、YAWARA!文庫第1巻は「作」、Reマスターは浦沢・長崎それぞれ「著」。PLUTOの出版社表記「浦沢直樹×手塚治虫」だけから作画は認定せず、同じISBNの国立国会図書館書誌の責任表示「浦沢直樹 [ほか]著」を独立Sourceとして確認する。国会図書館の書誌情報も原本の実見とは区別する。

「原作」Roleは今回追加しない。手塚治虫→PLUTOの制作Claimも追加しない。信長の両作者名、パイナップルARMYの工藤かずや名だけから原作や脚本を認定しない。会社関与は今回の制作Roleの対象外。

## 同じ出典と運用上の検証

関係概要には広いClaimと限定Claimの併存が独立資料の増加ではない旨を表示する。Claim詳細は取得済みClaim間でSource UUIDを照合し、同じ出典を共有する場合だけ注記する。同名Sourceの別UUID、同一Claim内の複数Citationを独立した複数Claimの共有と誤判定しない。出典の信頼度・独立性を自動評価する機能ではない。

実資料49 Claimの隔離部分Graphで追加・再適用・Role条件・cursor・詳細を確認し、Playwright3件が成功。全公開artifactの旧知識不変はunitと公開KGへのplanでも照合する。公開KGバックアップが60秒制限で実際に失敗したため、接続の反復走査とcanonical sort時の再直列化を索引化し、バックアップの読取transactionだけ180秒へ変更した。canonical順・fingerprint・未知属性拒否・復旧時の認可境界は不変。Webの探索読取制限は変更しない。更新先operatorで旧KGをbackupしてからWebを更新する。
