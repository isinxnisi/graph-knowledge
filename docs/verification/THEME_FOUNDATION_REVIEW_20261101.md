# Issue #75：全体レビュー・根拠入力と保存契約の改善

> 2026-11-02：本書は以下の実装・検証時点の記録。次の「対象名称訂正」へ進む旧推奨は、後続依頼による[本運用統合計画](../design/PLUNODE_PRODUCTION_INTEGRATION.md)・[新引継ぎ](../design/PLUNODE_PRODUCTION_HANDOFF.md)を優先する。以下の確認結果・build・保存データは変更していない。

2026-11-01。レビュー元 `5faeafd2`。今回のソースはこの記録を含むcommit。`codex/issue75-theme-foundation` の独立worktree・専用DB・localhost:3276のみ。main／3200／HTTPS β／本番／既存Workerは更新していない。

## 確認先と再開

- [テーマ一覧](http://localhost:3276/themes)
- [今回の仮想操作例](http://localhost:3276/themes/review-evidence-20261101)：並べて読む→行を開く→記録を訂正。根拠2を開くと、1件目とは別に編集できる。記録を加える→「このテーマの資料から選ぶ」で題名とURLだけを再利用。
- [今回の保存Capsule](http://localhost:3276/themes/capsules/f0648992-a429-4e6a-b1ef-a8a4dad6955b)
- [同じURLで更新した共有版](http://localhost:3276/themes/shared/iG_XAJHHn503rgyZLKXIBhlJvDUd7Ff9)：このPCのlocalhost専用。外部共有の実証ではない。
- 実テーマ：[Ada](http://localhost:3276/themes/ada-engine)／[Webb](http://localhost:3276/themes/webb-partnership)。今回その内容を更新していない。

再起動後はPowerShellから次を実行する。既存の専用DB・設定を使う。コードを変更していなければ再build不要。

```powershell
wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/scripts/issue75-preview.py start
```

状態確認は末尾を `status` に替える。3276使用中なら停止せず、このworktreeの稼働か確認する。ソースを更新するときのみ、hold取得後に `stop`→`build`→`start`。DB volumeを削除しない。buildはNode24と既存node_modulesを利用する。

実行build：`haFEgPJMum1L1ozNIkfNa`。型検査を含むproduction buildで起動。

## 全体レビューの結論

案Bの具体的記録、任意の意味対応、表示・検索、固定断面、明示訂正という土台を撤回する問題は確認されなかった。一方、以下3点は保存・意味表示の不備として修正した。登録を繰り返す負担を減らすため、根拠入力も一まとまり進めた。

1. local originの関係が全てaffirmedとして描かれていた。元記録の肯否・不確実をoriginに保持し、関係名を削らずに「（否定）」「（不確実）」を添えて描画。線種だけに依存しない。相互矢印を作るときも意味を引き継ぐ。根拠のstanceを勝手に反証へ変換しない。
2. Capsule作成に観測版がなく、別タブ訂正後に未読の新版を取り込めた。themeRevisionを必須とし、古い版なら409。選択とフォームを残し、自動再送しない。
3. 初期CapsuleのsourceDocument欠落時、現在の投影から旧比較基準を作っていた。歴史的な投影を復元し、説明注記の明示整理と後続訂正が独自編集を壊さないようにした。
4. 根拠を1〜20件追加・個別訂正・外す・直前の1件を復元できる。同じテーマの資料名とURLだけ再利用でき、主張ごとの箇所・抜粋は自分で確認する。同じ資料名・同じhostの別URLも区別する。候補の同名判定は件数に比例して処理する。

旧保存・共有Capsuleの内容へ自動移行はしない。旧形式で保存した関係の極性は、原記録の訂正を明示取込するまで旧表示のまま。別途一括修復をしたことにはしない。

## ユーザー評価と構想の境界

「並べて読む」は関係図と年表の対応表現の評価。現ページ全体の採用でも、年表同士の比較・マージの検証完了でもない。比較・マージは構想として保持し、今回検証しない。

登録の入口は、テーマなしのまとまり／関係図を中心に読むテーマ／関係図だけでは表しきれない年表構成を持つテーマとして考えられる。排他的な保存型にせず、記録・テーマの編集意図・年表構成を分ける。**現APIはtheme必須で、テーマなし入口とテーマ間の共通原記録参照は未実装。** 収集バッチをテーマと同一視しない。詳細とChat収集の概念ルート、正本所属・版・ID・公開範囲の後続判断は[継続設計](../design/THEME_FOUNDATION_NEXT.md)。

## 検証

- Vitest：11ファイル194件。`--maxWorkers=2`。通常の高並列実行では20件根拠のDOM試験が5秒でtimeoutしたため、テスト内容と上限を緩めず並列数を制限して完走。最終ソースでも同じ194件を再確認。
- 変更TypeScript／TSXのESLint：エラー0。Next production buildの型検査を含めて成功。
- 実DB＋HTTP：通常登録・訂正・共有18項目、時点／期間／不確かな境界・保存／更新21項目。観測版違いで作成409・状態不変、旧URL更新、停止404を含む。
- Chrome実操作：複数根拠の2件目だけ訂正、同名資料の区別、題名とURL再利用時に箇所／抜粋が空であること、追加→外す→戻す、390×844幅で登録、Capsule作成、別タブの元記録訂正、差分の明示取込、同じURLへの共有反映。
- 実操作後の保存内容照合：1件目の根拠と確認日、2件目の未編集の確認日を保持。元テーマ訂正で保存・共有断面が変わらない。明示取込でprivate Capsuleだけ更新し、共有反映後に同じURLの版が1→2になった。
- 操作例はその後、通常APIから否定・不確実が両方見える見本へ戻した（履歴保持）。保存・共有版3。実操作の結果と、この見本の整備を区別する。
- 既存データ保全：作業前13テーマ／14Capsule／8共有の各内容hashが作業後も全て一致。追加後16テーマ／18Capsule／9共有。会員DB・KG未接続、migrationなし。
- 作業前の専用DB dump：`.local/issue75/review-before.dump`。このturnでは復元試験を実施していない。既存データを戻して試験していない。

機械可読結果：[通常HTTP](../research/issue75-themes/foundation-review-core-http.json)／[時期HTTP](../research/issue75-themes/foundation-review-time-http.json)／[実操作](../research/issue75-themes/foundation-review-ui.json)／[保全照合](../research/issue75-themes/foundation-review-preservation.json)／[操作例の初期入力](../research/issue75-themes/foundation-review-fixture.json)。

実画面：[並列表示](../research/issue75-themes/issue75-review-parallel-final.png)／[スマホ幅の根拠入力](../research/issue75-themes/issue75-review-evidence-mobile.png)。

## 未確認・残件と引継ぎ

実機iPhoneのキーボード・Safari挙動、人間の登録所要時間、テーマなし登録、グローバル同定、対象名称等の訂正、通常探索との往復、会員認証・コミュニティ・正式OGPとの統合は今回完了していない。今回の2つの実テーマの調査・翻訳・入力準備はCodexが補ったため、人が低負担で登録できるという実測に読み替えない。

次の確定した実装単位は対象の名称・分類・説明の訂正。サービス全体の導線と共通原記録化は横断設計であり、論点と受入を固めてから実装する。Sol6.1高への具体的な依頼文、Astraへ戻す判断点は[引継ぎ設計](../design/THEME_FOUNDATION_NEXT.md)に記録した。モデル間の同条件比較は未実施。
