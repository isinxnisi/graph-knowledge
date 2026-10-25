# コミュニティのスマホナビゲーション検証（2026-10-24）

基準 main `40b2e25`。採用した構成は [設計記録](../design/COMMUNITY_MOBILE_NAVIGATION.md)。実コミュニティ UI を変更し、3275 の架空試作は変更しない。

## 主な変更

1. 上位カテゴリとカテゴリ内の項目を分離。別カテゴリの目的地をメニューから直接選び、中継画面を作らない。現在のカテゴリ名は固定位置、選択項目は下のレールに表示する。
2. 個別コミュニティ・スレッドの所属カテゴリを統一。URL/hash が確定する前に別のカテゴリを確定表示しない。
3. スマホヘッダーをブランド・サイトメニュー・表示設定に整理。メニュー内で本人名と状態を示し、探索復帰・発見・本人の機能へ移動する。対応待ち招待は閉じたメニューでも表示する。
4. コミュニティ名の右に補助メニューを置き、公開状態と参加操作を別の一組にする。長い名前でも3点メニューだけを単独行へ落とさない。
5. ライトの補助文字・区切り・選択面を明確にし、ダークは既存テーマ色を使用する。Graph 配色や認可・DBは変更しない。

## 画像

すべて隔離 DB の架空データ。日英、320／375／390／430px、高さ844pxの同条件で記録する。会員名・投稿本文がある実 beta の画像はリポジトリへ保存しない。

|条件|変更前|変更後|
|---|---|---|
|320px JA ライト・コミュニティ|[前](assets/community-mobile-20261024/before/320-ja-light-community.png)|[後](assets/community-mobile-20261024/after/320-ja-light-community.png)|
|390px JA ライト・アカウント|[前](assets/community-mobile-20261024/before/390-ja-light-account.png)|[後](assets/community-mobile-20261024/after/390-ja-light-account.png)|
|375px EN ダーク・コミュニティ|[前](assets/community-mobile-20261024/before/375-en-dark-brown-community.png)|[後](assets/community-mobile-20261024/after/375-en-dark-brown-community.png)|
|430px EN ライト・アカウント|[前](assets/community-mobile-20261024/before/430-en-light-account.png)|[後](assets/community-mobile-20261024/after/430-en-light-account.png)|

全16組の画像は各フォルダに保存。メニューの開いた状態と大きめ文字の表示も別途記録する。

## 検証の境界

書込みを伴う作成・投稿等は既存の隔離 PostgreSQL＋検証用 OIDC を使用する。実 beta は既存データの閲覧・遷移・表示の確認に限る。新規migration、会員DBの権限モデル変更はない。iPhone実機は運営者の再評価に残し、Chromium狭幅の試験を実機確認済みとは扱わない。

## 重点検証

- 変更前の4幅×日英×ライト／ダークを隔離データで撮影。
- 遅延認証・内部移動3件、認証失敗と未ログインの区別1件、招待の非リロード更新1件、会話・作成・活動3件、スマホ16条件の複合試験1件：9件成功（4.5分）。
- 関連単体18件成功（session、identity、共通操作部品、通報）。
- スマホカテゴリメニューは実際の目的地へ直接移動する。カテゴリ先頭への中継履歴を作らない。固定位置のカテゴリ名と選択レールを分離した。
- 個別コミュニティの横レールは、直接URL・履歴移動でも選択項目だけを必要な量だけ画面内へ寄せる。windowスクロール・React状態・Historyへの書込みは増やさない。
- ライト補助文字の背景 #f3f3ef に対する計算コントラストは4.65→5.50。本文色は維持。ダークでは既存テーマ変数を使い、ライト向け固定色を流用しない。

測定・試験はChromium。iPhone実機・OS文字拡大は未確認。大きめ文字はブラウザ内CSSによる確認であり、OS設定と同一ではない。
追加検証：管理タブを画面内へ寄せる処理を加え、16条件matrixを再実行。ログイン復帰と入力保持・通報再送（日英PC/390/320）を合わせ5件成功（3.3分）。修正前の消失を測る専用baseline 1件は通常運用どおりskip。TypeScript・変更TSXのESLint成功。試験中の認証/ページ取得遅延、失敗、別User、個別ページ拒否を含む既存検査を維持した。

## 反映・保全

旧build `YRaA0GOCLG13vk5z77VgL` を `backups/community-mobile-prebuild-20261024/.next-public` へ退避。3200の既存起動プロセスを確認して停止し、既存 public-kg build/start を使用する。切り戻しは3200の所有プロセスを確認して停止し、退避した .next-public を戻して同じlauncherで起動する。DB migration・権限・認証設定の変更はない。

会員Capsule・コミュニティ・membership・スレッド・投稿について、反映前後の件数と行内容ハッシュを照合する。既存ユーザーの投稿・招待・設定を検証のために更新しない。
### 反映結果

- build：`tR1pjcTtiHIrb50LNXuyL`。3200と `https://graph-beta.isinxnisi.com/communities` のHTMLで一致を確認。最適化build成功（コンパイル1.1秒、型検査9.7秒）。
- ログイン済み実beta：Graph→コミュニティ一覧→限定コミュニティ→管理→ブラウザBack→会話、個人Capsule→設定→招待→自分の投稿、探索へ戻るを確認。GraphはPLUTO、Entity 4／Claim 6、Relation 3、ズーム91%の状態へ復元。
- 実beta本人の投稿一覧は0件だったため、該当投稿への移動は隔離DBの複数ページ試験で確認。実betaで投稿や招待を追加して検証結果を作っていない。
- 反映前後の保護対象5表（community、community_member、community_thread、community_post、member_capsule）の件数・内容ハッシュが一致。
- 本番・公開KG・収集Worker・Kev・3275／graph-comは未変更。ログイン済み実betaはPCでの確認、4幅のモバイルは隔離ブラウザ試験。iPhone実機とOS文字拡大は運営者確認に残る。

所要の内訳：設計・UI調整と自己レビューが主工程。重点E2Eは初回4.5分＋最終3.3分、変更前画像16条件の取得と修正途中の試行を別途実施。build自体は約15秒で、DBやAPI性能による待ち時間は検出しなかった。初回のテスト条件ではhashのみの遷移でlocaleが更新されない点を修正して再撮影した。また、カテゴリメニューに汎用detailsの閉じアニメーションが適用される問題を修正し、遅延認証・連続遷移を再試験した。