# Issue #75 初版：実操作・検証・再開

2026-11-01。worktree `/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation`、branch `codex/issue75-theme-foundation`。

## 確認先

- [テーマ一覧](http://localhost:3276/themes)
- [解析機関と翻訳](http://localhost:3276/themes/ada-engine)
- [Webbの国際協力](http://localhost:3276/themes/webb-partnership)
- [訂正を取り込んだAdaのCapsule](http://localhost:3276/themes/capsules/44282431-8929-406a-870a-f56b5bad1f12)
- [Adaの確認用共有版](http://localhost:3276/themes/shared/aq8w3WlZPm35Lxs2ER2VGEwo0cHb-yI9)

開発PC専用。既存3200・HTTPS β・正式サイトへこの機能を配置していない。390×844のChrome確認と、未確認のiPhone実機・Google認証を区別する。

テーマを開き、「記録と根拠」で検索・選択→Capsule保存→編集・保存→共有へ反映。元記録の訂正後は、Capsuleに出る更新差分を確認して取り込む。

## 起動・再開

Dockerを起動したうえで、PowerShellから実行する。

```powershell
wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/scripts/issue75-preview.py start
```

末尾を `status` にすると確認、`stop` でこの専用Webだけを停止。既に3276が使われていれば既存プロセスを止めない。変更後は `stop` → `build` → `start`。変更・テスト前は既存Autopilot holdとtoken確認を行う。`dev` は開発時のみで、最終確認はbuild版。

専用container `plunode-issue75-postgres`、volume `plunode-issue75-data`、127.0.0.1:55475、DB `plunode_theme75`。コンテナ再起動でデータは消えない。private設定・Node実行物・ログ・dumpは `.local/issue75/` に保存しGit対象外。Node24をここへ複製し、依存パッケージはこのworktreeのlockfileから独立して導入した。会員DB・認証・既存KGの設定は持ち込まない。

新しいcloneではNode24・Dockerが必要。`npm ci` 後に `build` → `start`。既存PCのruntime設定を紛失した場合、新しいパスワードで既存volumeへ接続し直そうとせず、私有backupと設定を確認する。

## 実テーマでの操作

**テーマ1：解析機関と翻訳。** 入力例→パッケージ確認→登録を実ブラウザで実行。6対象、5記録（関係4・エピソード1）。意味条件「翻訳」で英訳1件、条件を解除し「注釈」で未整理の具体的な関係も検索。選択5件は保持された。

5件をCapsule保存→共有版1発行→タイトルを「翻訳と注釈から広がる可能性 — 私の読み方」へ変更して版2保存→共有側は元タイトル・版1を維持、と別タブで確認。

原記録の英訳scopeに「1843年に刊行された英訳。原論文の著述・Notesの追加と区別する。」をフォームから追記し理由も保存。Capsuleで旧scopeと新scopeを比較→明示取込して版3→共有へ反映→同じURLを再読込し独自タイトル・版3を確認。開いている共有画面が途中で自動差替えされないことも確認。

**テーマ2：Webb。** 同じ経路で6対象・5関係を登録。ロケット・観測装置・軌道点は自由分類。「光学系」の文字列検索は根拠要約も含み2件、具体文「ESAはWebb用MIRI」では1件。MIRI記録に「部分・構成品の提供」を定義して対応付け、意味条件で1件を確認。5件をCapsule保存・共有した。

さらに通常フォームで「ESAはWebbのためにAriane 5と打上げサービスを提供した。」を根拠付きで追加。Role・コードの追加は不要。現在は6記録。以前のCapsuleは保存した5件を保持する。選択範囲の固定断面であり、テーマ全体の追加を自動取り込みする購読ではない。

最終ビルドではMIRIの根拠箇所を「four major European contributions：MIRI optics の項目」へ訂正し、理由を保存。内容版2となり意味対応が未整理に戻ること、既存の「部分・構成品の提供」を再定義せず再選択できることを確認した。保存済みCapsuleで根拠の旧箇所／新箇所と訂正理由を比較→取込して保存版2→別タブの共有はまだ版1→明示反映後に同じURLで版2、まで実操作した。

## 登録負担と補った判断

| 項目 | 実際に行った量 |
| --- | --- |
| 資料調査 | 各テーマ3ページ、計6ページ。一次文献転記と編集注、博物館二次解説、NASA・ESAを区別 |
| パッケージ | 各6対象・5記録。テーマ固有アプリコードは0件 |
| 取込 | 各テーマで例を開く→内容確認→登録の3操作。入力例の展開は別 |
| 後から追加 | Webbで1記録、対象2欄・関係名・具体文・資料URL／名／箇所／要約の8欄、1回保存 |
| 訂正 | Adaでscopeと理由の2欄。Webbで根拠箇所と理由の2欄＋既存意味の再選択と理由。両方でCapsule差分確認・取込・共有反映 |
| 意味整理 | Ada初期1件、Webb後から1件。全件に意味定義を強制しない |

資料探し・読解・翻訳・対象分離・主張作成、構想と実績、提供責任と製造責任の区別はCodexが補った。運営者による根拠承認済みとはしない。アプリの自動読解は0件。URLだけから自動登録する機能はない。

自動操作の経過時間例：Webb登録→検索1.998秒、追加フォーム入力→保存通知1.704秒、Ada訂正入力→送信1.261秒。用意済み文をツールが入力した時間で、人間の読解・入力時間ではない。資料調査の開始時刻は計測しておらず、人手相当時間への換算もしない。新テーマを運営者が実際に登録する評価が残る。

資料と意味判断は [EVIDENCE.md](../research/issue75-themes/EVIDENCE.md) に記録。

## 検証

- 添付fixture：12チェック成功。SHA256 `44c9f4b6cf1e4813438dd32e3b04ad617af2dc20d669cfed1138fd43acb221fd`。一時コピーで再実行し原4ファイルは保持。アプリE2Eとは別。
- 新domainテスト7件：実テーマ、未対応語、参照不正、実在日付・逆転、周期・定性軸、意味／内容差分、Capsule投影。
- 新UIテスト3件：新版の読込中に旧版の図をマウントしない、通常訂正で時期ラベルを保持、根拠だけの訂正を新旧比較できる。
- 既存CapsuleStudio44件・Capsule文書21件の回帰を確認。
- HTTP入力経路17チェック：再送・競合・別origin拒否・意味と根拠の分離・定義の再利用／変更拒否・検索・共有固定・明示取込・独自ラベル／配置維持・端点変更・エピソード訂正・停止・不正token。[結果](../research/issue75-themes/http-verification.json)。合成データと実テーマを区別。
- 変更TS/TSXのESLint、TypeScript、Next webpack build。
- Chromeデスクトップと390×844で検索・図・訂正モーダル。iOSキーボード・実機は未確認。

発見して修正した問題：初回DDL競合、記録と図の内容版ずれ、エピソードとノードの重なり、見出しの詰まり、スマホの常設フィルターと初期倍率、同名対象の曖昧照合、再送時のID、編集中の共有／差分取込、隔離環境で不要なKG操作。最終レビューでは意味の最終対応解除後の定義保持、エピソードの説明根拠、表示変更に左右されない取込比較基準、根拠等だけの訂正表示と時期ラベル保持を補った。

大量データ・複数人の負荷、外部共有権限、年表合成等は未確認・未実装。[設計と制限](../design/THEME_FOUNDATION_ISSUE75.md)を参照。

## 永続化・復元・保全

専用DBのcustom-format pg_dumpを別DBへ復元。state hash・テーマ／Capsule件数・events／receipts件数が一致。[復元結果](../research/issue75-themes/restore-verification.json)。既存DBは対象外。

この作業のHTTP試験が作った4件の合成テーマ・Capsuleと試験用意味だけを正確なIDで照合し、専用dumpとeventsに元状態を残して確認用一覧から外した。現在の一覧は実テーマ2件・Capsule2件・再利用できる意味2件。ユーザーの既存データ、実テーマ、既存環境の履歴は削除していない。最終退避前dumpのSHA256は `72eaf50d5f6e2005d6cb16bd3dbb64a043015427fea97fbb6cc6be442953cd50`。

## 最終確認環境

2026-11-01 13時台（JST）。build `-gkMI3I1mWi6LctkhJn1l`、Node24、独立した依存関係で起動。75テスト、17 HTTPチェック、12添付fixtureチェック成功。ESLint・TypeScript・webpack build・Python構文・差分検査も成功。追加UIテストの型指定誤りをbuildで検出し修正、該当3テストとbuildを再実行した。

localhost:3200はHTTP200を確認したが、このbranchを配置していない。HTTPS βへの自動HTTP確認は403だったため、この確認でβの認証後動作まで確認済みとはしない。β・本番・mainは変更していない。

実画面：[デスクトップ](../research/issue75-themes/desktop.png)、[390px](../research/issue75-themes/mobile.png)、[根拠の訂正比較](../research/issue75-themes/correction.png)。

Autopilot review・hold/tokenで保護。未受入候補は取り込まずmainの`memo.txt`を保護。commit・push・最終build・hold解放は配置記録と最終報告で確定する。
