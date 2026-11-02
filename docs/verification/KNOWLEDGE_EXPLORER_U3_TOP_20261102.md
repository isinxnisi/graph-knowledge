# U3：TOPの配置・既存一覧との統一・テーマ初期表示

2026-11-02。`codex/issue75-theme-foundation`／独立3276の追補。今回のユーザー指摘は、テーマの見た目が既存デザインから浮くこと、TOPでテーマだけ後から現れること、紹介・新着の順序。既存の「ほかの対象から探す」を削る依頼ではない。

## 変更

TOPは、導入と検索に続いて、PLUTO紹介 → 紹介テーマ → ほかの対象から探す → 新着テーマ → 最近加わった知識。長崎尚志・ニールス・ボーア研究所・第5回ソルヴェイ会議の入口を保持する。

紹介テーマは対象別入口と同じ小さいアイコン・淡い面・文字サイズ・余白を共有する。新着テーマは既存新着の細い区切り線と日付・文字サイズに合わせ、検索結果も既存「一覧・条件から」の結果行を共有する。テーマの表示種類はiconと文字で区別し、PCの紹介は約3列、スマホは横送りとする。

テーマの遅れは、従来TOPの表示後に紹介と新着がそれぞれブラウザからAPIを呼んでいたため。今回、既存TOPデータと並行して公開可否を検査した同じcatalogをサーバーから読み、初期HTMLへ渡す。紹介・新着は一つのhookを共有し、再訪／定期再読込を行う。初期HTMLにも既存のlocalhost Host制限を適用する。異常時は8秒を上限とし、既存TOPを操作できる状態と再取得操作を残す。大規模catalogの性能対策を完了した意味ではない。

## 検証

- UI試験4件成功。固定版リンク、種類表示、初期データを待たずに表示すること、紹介・新着の再取得の共用、旧応答の失効、種類・名前・並び順の組合せと解除を確認した。
- 変更TS/TSXのESLint、Python構文、diff空白検査、型検査込みNext production buildが成功した。
- [読取HTTP結果](../research/issue75-foundation/u3-discovery-http-results.json)は56項目・14 GET・書込0。初期HTMLの順序、既存3対象入口の正確なURL、クライアント取得前のテーマ、foreign Hostにテーマを返さないことを追加した。紹介／検索／旧catalog保持など従来50項目も再実行した。JSONは今回の結果へ更新し、前回の50項目・12 GETは従来検証記録に履歴として残す。
- 配置buildのHTML全文取得を3回測定し、2.069秒・1.298秒・1.456秒。全回で紹介・新着がHTML内に存在した。ブラウザ描画時間や大規模データの性能測定ではない。
- Chrome PC実操作でTOPの順序、紹介と既存対象入口、新着と既存新着の密度、一覧からテーマ検索を確認した。検索は既存の結果行と同じ13pxの見出し・10px/4pxの余白を共有する。
- Chromeの390×844で紹介の横送り配置、検索条件の開閉、「年表」＋「Webb」の2件への絞込、結果から中央の年表を開く、ホームへ復帰する操作を確認した。ページの横はみ出しはなかった。viewportは通常幅へ復帰した。iPhone実機・キーボードは今回再検証していない。
- 証跡は開発PCの `C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/` 以下の `u3-top-preserved-subjects.png`、`u3-top-recent-unified.png`、`u3-theme-search-unified.png`、`u3-top-preserved-subjects-mobile.png`、`u3-theme-search-unified-mobile.png`。

実装source：`daf8db450cb85678b5840050c4f1dc8ec9d3aa19`。稼働build：`95582cvRlCOD54b3L_zW0`（`.next-public`）。開発モードでは初回コンパイル・サーバー側初期化が遅く、初期の3秒上限でテーマ取得失敗となったため8秒へ修正し、検証用production buildで確認し直した。単に温まったdev画面だけを成功として扱っていない。

データ更新・migration・新規サービス・課金変更はない。main／3200／HTTPS β／VPSへは配置せず、独立環境の既存PG・Neo4j・通常Explorerを維持する。今回の変更は作業branchへ日本語commit・通常pushし、完了時に保持terminalから共通holdを解放する。結果は完了報告へ残す。

## 起動・再開

このworktreeで `python3 scripts/issue75-preview.py status`／`start`。ソース変更時は共通hold下で `stop` → `build` → `start`。public-kgのbuild IDは `.next-public/BUILD_ID`。private runtimeと既存専用volumeを引き継ぎ、削除・再作成しない。確認先は <http://localhost:3276/>。TOPの「テーマを探す」から「テーマから」検索へ進み、名前・種類で絞り込む。
