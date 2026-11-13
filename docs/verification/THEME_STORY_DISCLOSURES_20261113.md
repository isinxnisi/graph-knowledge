# エピソード・豆知識の本文開閉（2026-11-13）

①現状確認・②実装・③ローカル3200／HTTPS β反映と実画面確認まで完了。source `196672dd` と余白補修 `a3d99de1`、最終build `XV1OxH7Wf6eOlcHYLXj1U`。本番公開は未実施。

## 変更

- テーマ概要のエピソード・豆知識は登録済みshortTitleを見出しとして並べ、その場で各本文を開閉する。独立して複数開ける。タイトル未登録時は既存の時期ラベル／本文へのfallbackを維持し、見出しを自動創作しない。
- 既存AnimatedDetailsを再利用。開閉の短いアニメーション、native detailsのキーボード操作、reduced-motionを保持。
- 開いた本文の末尾へ小さな「出典・詳細」操作を置く。通常閲覧に遷移は不要。出典詳細へ進んだ場合も一覧へ戻れる。親DOMを保持し開閉状態を残す。
- 初期3件／全件表示／閉じるは既存の同じ見出し位置を維持。カード枠や大きなボタンを追加しない。共通Explorerのp余白との競合を局所指定で抑制。
- テーマ作成API、原文、商品、画像、年表、保存・共有、DB、Worker、本番を変更しない。

## 確認

`theme-reading-refresh.test.tsx`・`knowledge-reading-location.test.tsx`の26件成功。個別開閉・複数展開・タイトルと本文の対応・遷移を伴わない読書・小さい詳細操作・戻る後の保持・一覧全体の開閉を含む。対象eslintはerror0、KnowledgeReadingの既存未使用readKnowledge warning1。型検査込みbuild成功。

Chromeの既存βテーマ（PLUTO構成版8）で375×631・1500×900を確認。タイトル→本文開閉、全11件→3件、出典詳細→一覧復帰と展開保持、英語のSources & detailsを確認。最終375pxはページ／右ペインとも横溢れなし、本文margin0。修正後iPhone実機は未確認。英語未登録の投稿本文・見出しを今回翻訳したとは扱わない。

3200／HTTPS βとも200。Webのみ切替、既存Workerは稼働を維持。

画像記録：`C:/Users/nishr/.codex/tmp/theme-stories-20261113/` のbefore-375.png、final-closed-375.png、final-open-375.png、final-open-1500.png。英語確認はafter-en-1500.png（最終build）。最終版以外の途中確認画像も同folderへ保持。
