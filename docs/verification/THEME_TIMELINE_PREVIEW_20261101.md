# Issue #75：年表グラフ試作・確認記録

2026-11-01。`codex/issue75-theme-foundation` の追加実装。Gitグラフを着想とした未完成案を、実データと保存契約を持つ画面へ具体化した。年表全仕様の完成・mainへの受入を意味しない。

## 確認先と手順

- [Webbが宇宙でひらくまで](http://localhost:3276/themes/webb-deployment-timeline)
- [年表を保存したCapsule](http://localhost:3276/themes/capsules/c3c27c18-569f-4743-a56a-bd78ad15deb6)
- [確認用共有版](http://localhost:3276/themes/shared/pb-ntRgeD8QLErCU4tviZQ6LI_8y1DIe)

テーマを開く→「年表」→2022-01-05の副鏡展開の行を開く。「この日の工程」から09:52頃〜12:23頃の内訳へ進める。「関係図で見る」または「並べて読む」で同じ場所に図を表示。チェックはCapsuleへ入れる範囲、行の開閉は閲覧対象として別に保持する。

旧テーマの[解析機関と翻訳](http://localhost:3276/themes/ada-engine)も年表で読める。軸構成のないテーマにも時期型から表示を作り、時期不明の記録に日付を補わない。

Dockerを起動してPowerShellから実行する。

```powershell
wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/scripts/issue75-preview.py start
```

`status`で応答確認。コード変更後はAutopilot hold/tokenを保持し、`stop` → `build` → `start`。専用DB・volumeは削除しない。詳細は[初版の再開手順](THEME_FOUNDATION_ISSUE75_20261101.md)。

## 実装した範囲

- 関係図／年表／並列／記録と根拠を同じ作業面で切替。保存した図の独自編集と原記録の年表を区別する。
- 同じ主語をたどる細い線と点、開始・終了を明示する期間線を区別。行の間隔は経過時間を表さない。
- 行内に範囲・根拠・訂正・関連する子年表を展開。時間軸ごとの起点・順序・EST・概数を保持。
- Capsuleは選んだ記録と参照対象・必要な軸だけを固定。親だけ保存しても子を暗黙追加せず、子だけ保存しても日付・timezoneの文脈を保持。
- 訂正で軸と合わない時期へ変える場合は、明示した配置解除で保存可能。Capsuleでは選択した訂正だけを取り込み、公開済み断面は共有反映まで維持。
- 凡例は「線の見方」にまとめ、入れ子の切れ・親の選択色が子全体に広がる問題を修正。行展開は短いtransition、動きを減らす設定では無効。
- 年表からの外部フォーカスは図の対象と両端を表示。図が非表示なら保留し、正の寸法へ復帰したとき一度だけ適用。通常Graphにはこの外部入力を渡さない。

## 実ブラウザで確認したこと

Chromeデスクトップで、入力例→内容確認→登録を実行。6対象・11記録・2軸が保存され、主年表7件と副鏡工程4件を行展開から読めた。期間の開始／終了、EST・概数、原資料リンク、対象選択とCapsuleチェックの独立を確認した。

全11件をCapsuleに保存し、共有リンクを発行。別タブで共有版1の年表と子軸を読み、訂正ボタン・Capsule選択が出ない閲覧専用表示を確認した。

390×844では初回年表に横はみ出しがないことを確認。子年表左端の切れと子全体への選択色を発見し修正。修正後の子年表・選択色はデスクトップで確認した。

その後、Windows側で現在のブラウザURLを確実に確認できずComputer Useが停止したため、**最終版の390px再確認と、非表示Graphへのフォーカス保留修正の実ブラウザ再確認は未完了**。別手段のブラウザ操作へ切り替えていない。iPhone実機・キーボードも未確認。最終版をすべて実画面で確認済みとはしない。

## 検証

- domain/UI/Capsule/Canvasの対象回帰テスト：最終結果は下段。
- [年表HTTP 16項目](../research/issue75-themes/timeline-http-verification.json)：軸永続化、親だけ／子だけの切出し、未選択Entityの除外、共有固定、不整合訂正の拒否、明示配置解除、別記録だけの取込で旧配置保持、子軸保持、同じURLへの再共有、停止。
- [既存HTTP 17項目](../research/issue75-themes/timeline-regression-http.json)：再送・競合・別origin拒否・意味と根拠の分離・訂正・独自編集維持・端点変更・共有の回帰。
- 変更TS/TSXのESLint、Next webpack build内のTypeScript、git diff --check。最後のフォーカス保留修正はCanvasテストで検証。backendはHTTP確認から変更なし。
- HTTP検証は専用3276への入力経路。既存会員DB・KG・認証は接続していない。

## 登録負担と補った判断

NASAの公式7資料から、6対象・主年表7件・一日の工程4件を整理。期間の停止日、構造展開と光学調整、到達と固定と確認、ESTの概数を区別した。アプリの自動解釈ではなく、今回Codexが資料を読んで入力例を準備したもの。

通常取込は入力例を開く→内容確認→登録の3操作（入力例欄の展開は別）。原本の読解・記録作成・2軸と11配置・1親子対応は準備済み。人間の登録時間は計測しておらず、自動操作時間を人手負担へ換算しない。テーマ専用のアプリ分岐は0件。追加したのはJSONと根拠記録。詳しくは[根拠と編集判断](../research/issue75-themes/TIMELINE_EVIDENCE.md)。

一つ目・二つ目の登録経路と負担は[初版の確認記録](THEME_FOUNDATION_ISSUE75_20261101.md)を継承。今回のWebb工程は年表構造を検証する第三の実テーマ。

## 保全・環境・残る制約

mainのmemo.txt、既存テーマ・Capsule、ユーザーが追加したwebb-partnership2とCapsule e2952adb-d233-456a-9de4-d979621b53c4を保持。今回のHTTP検証が作った正確な2テーマID／5Capsule／試験用意味だけを、専用dumpとeventsへ原状態を保存して一覧から退避。[保全記録](../research/issue75-themes/timeline-data-preservation.json)。既存会員DBのmigration変更なし。

main／3200／HTTPS β／本番へ統合・配置していない。共有Kev・収集Worker・AI処理・管理Connectorは対象外。共通holdとtokenで保護し、未受入の自動開発候補は取り込まない。

期間線は行内の両端表示。複数行にまたがる期間、時間比例尺度、軸の合成・比較、2対1・連結、複数時期注釈は後続。現状1記録1時期1軸、入れ子3段まで。新しい軸や親子対応はパッケージ入力で、専用構成編集UIはまだない。[年表試作の設計](../design/THEME_TIMELINE_PREVIEW.md)を参照。

## 最終実行物

build `lJ8EV29gj8jnE0s9IXYpV`。Node24・Next webpack build（TypeScript含む）成功。対象7ファイル116テスト成功、変更14 TS/TSXファイルのESLint成功。年表HTTP16＋既存HTTP17項目成功。

最終build再起動後、テーマ画面HTTP200と、元テーマ・共有snapshotの11記録／2軸の永続化を再確認した。年表の実画面確認は上記の範囲に限定する。commit／通常push・hold解放は最終報告で確定する。
