# AI育成ラボ：操作なしのニュートラルな浮遊表示

2026-10-22。開始HEAD36f58f3、branch codex/ai-lab-foundation。main214b5c4、自動側未反映0／dirtyなし。既存mainのmemo.txtを保全し、共通ロック取得・token review後に作業。既存未受入成果・他作業の変更なし。

## 確認先

- [ラボ主表示](https://graph-ailab.isinxnisi.com/ai-lab#apprentice)：操作なしで標準強度の浮遊を自動再生。
- [手動比較](https://graph-ailab.isinxnisi.com/ai-apprentice-motion-study)：5状態・再生／停止・標準／強・控えめ設定を維持。初期は強を選択した停止状態。

ラボから再生／停止・強度・DEMO状態選択・控えめ設定の操作欄を撤去した。プロフィールは既存PNGのまま、ニュートラルな上下浮遊のみ。表示上の演出という注記と、実活動が未監視という実状況を分けた。実稼働・探索・学習中の証拠として表示しない。公式AI・極小・目は静止、右下常駐・チャット・正式アセットや実状態連動の追加なし。

内部定数LAB_AVATAR_STRENGTHで標準を指定し、strongへ変更できる構成を保持。画面の状態・URL・実験記録から強度や実活動を解釈しない。主表示は可視性・OS設定から自動再生を決め、比較画面の手動stateとは独立する。

## 検証

隔離production build・TypeScript成功。自動再生テストはクリック前のanimation時間進行、本文位置の不変、操作欄の不在、標準とニュートラル固定、文字との離隔、公式AI静止、実績・履歴を検査する。画面外・非表示・OS低減で停止し、復帰時に操作なしで再開することを確認する。非表示分岐はdocument.hidden／visibilitychangeのシミュレーション、画面外は実scroll、OS低減はPlaywright media emulationで検査する。低減設定を有効にしたままの再読込も検査し、初期再生が起きないことを確認する。

実行記録7件・非AI5・AI実推論0・推論前保留2・追加学習0、見習いID、Graph・根拠・履歴の正本は変更なし。操作の選択・活動記録・モデル呼出しを追加しない。

公開確認URLで日本語／英語 × PC1440px／スマホ390px × light／dark-blue の8条件が成功。操作なしのanimation時間進行、停止条件、復帰、本文の位置不変、横はみ出しなし、標準強度、操作UI不在、公式AI／極小静止、比較画面への往復を確認した。ページ例外・更新リクエスト・Kev呼出しは0。スマホの低減設定を有効にしたままの初回表示も静止を確認した。

比較画面の代表回帰（日本語・PC・light）も成功。5状態・標準／強・手動再生停止・キーボード・控えめ設定・OS低減・非表示停止・固定の目と極小表示を維持した。

既存navigation.test.mjsも日本語／英語 × PC／スマホの4条件で成功。Home・Graph・根拠Claim・アカウントへの往復、Graphの配置／zoom／pan、レビューの開閉とscroll位置、履歴・実績、初稼働準備の表示を維持した。直リンク、非公開path、書込拒否、Host検査、CSP、未承認レビュー資料の取得も成功。隔離3268・旧3286中継・公開確認URLの環境検査も成功した。

実行した検証はproduction build、lab-motion.test.mjs（8条件）、motion.test.mjs（代表1条件）、navigation.test.mjs（4条件）、既存環境検査。動きと導線のブラウザ検証はAI_LAB_ORIGINを公開確認URLに指定して実施した。

目視ではPCの明背景、スマホの暗背景、日本語／英語のスマホ主表示を確認した。以下は実際の停止条件テスト後に浮遊の途中フレームを固定した画面で、AIの実活動を示す画像ではない。

- [PC・明背景の全体](ambient-motion-20261022/desktop-light.png)
- [スマホ・暗背景の全体](ambient-motion-20261022/mobile-dark.png)
- [スマホ・英語の主表示](ambient-motion-20261022/mobile-english.png)

## 反映範囲

既存隔離3268と旧3286中継だけを更新。main統合・beta3200・コミュニティ3275・VPS・共有Kev・会員DB・推論／学習／投稿を変更しない。Cloudflare設定の変更なし。
