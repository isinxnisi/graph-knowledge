# 原語保存の第一段階

2026-11-05。[現行契約](../design/KNOWLEDGE_ORIGINAL_LANGUAGES.md)。多言語全体は未完了。原語保存・異言語の事実訂正までを対象とする。

## 確認済み

- 隔離会員／知識DB、OIDC・原資料fixture：49件成功。日本語原文に英語で事実訂正し、同じIDの次版へ英語文と言語を保存。旧版・元の引用・資料pin・Capsule・訂正者を保持した。引用だけ／記載箇所だけの訂正、変更なしno-op、取消・現在の公開状態の検証も継続。
- 隔離知識PG・原語・投稿UI：64件成功。Themeの原題・説明の別言語が保存され、原記録訂正で旧Theme断面が差し替わらない。本文と引用の言語が異なる草稿の保存・再訪、旧作者の言語を新しい文へ転記しないことを確認。
- 関連するCapsule・受理計画・収集計画の単体確認も成功。収集は日本語生成文を生成処理由来として区別し、引用の原語を日本語へ書き換えない。外部AIへの新規呼出は行っていない。
- 変更したTypeScriptのESLint、diff check成功。原語と審査文脈の最終単体8件、関連Capsule・公開読取・UI70件も成功（前段の件数と重複あり）。Node 24の完全build・型検査が成功。

## 未実装・未確認

翻訳文の独立保存、訳文だけの訂正、訳者帰属、自動翻訳、訳名検索は後続。言語の保存ができることと、多言語でのGeminiの審査精度・訳の精度は別であり、今回のfixtureから実モデルの精度を保証しない。UIで新しく選べる原語はja／en／mul／未指定。他言語tagの保存検査・既存値の保持とは分ける。


## β配置と実Googleの確認

- 最終app source `ca8bd4c823264c195d4d779680166e1df3db0854`、build `Wbe4DmLbue8-YBBhQmfH-`。main／localhost:3200／HTTPS βへWeb・既存の投稿受理Workerを反映。新規migrationなし。会員ledger29件／知識001・002・004のchecksumとprivate profileを保持。
- 3091 tracked filesを配置sourceとbyte照合し、既存cacheからbuild。切替前に会員・知識のcustom dumpを保存し、直前の別DB復元照合と、今回の隔離OIDCテスト内の復元・再実行検証を活用した。切替前後で26 Record版・5 Theme版・25 Capsule・会員ledgerの内容hash不変。3276／本番VPS／共通Kev／Cloudflaredは未更新。
- 実Googleの既存セッションで[確認用草稿](https://graph-beta.isinxnisi.com/member/submissions?id=445c7a0d-42a0-43df-ae93-c57cb190917e)を新規保存・再読込。日本語UIのまま、名前ja、本文en、資料本文en、原題en、引用enを保持。草稿DBの値も照合した。公開・AI確認は依頼せず、既存の未読7件を変更していない。
- PCと390×844で確認。スマホは横はみ出しなし（document幅380／viewport390）。小さい言語選択と、任意の資料言語の折り畳みを確認し、viewportを元に戻した。実ブラウザはapp `c052b634`。最終 `ca8bd4c8` の差分は審査へ渡す資料言語の解決と単体テストだけで、UI差分なし。最終buildも3200／HTTPS βのdataset・投稿画面200を照合した。
- 英語の事実訂正・旧日本語版・訂正者・Capsule保持は隔離OIDC／原資料fixture。実Googleによる異言語の公開審査精度を確認した意味ではない。
- [機械可読記録](assets/knowledge-original-languages-20261105.json)／[PC画面](assets/knowledge-original-languages-pc-20261105.jpg)／[スマホ画面](assets/knowledge-original-languages-mobile-20261105.jpg)。

## 再開と残り

起動は `docs/runbooks/KNOWLEDGE_BETA.md` の既存launcherを使う。DB resetや過去dumpへの巻戻しは不要。原語保存は第一段階までで、U6全体の完了ではない。

次の多言語単位は、対象の内容版・項目・訳先言語を固定した翻訳保存／訳文訂正／訳者帰属。その次に利用枠・cache付きの自動翻訳と実評価。追加2まとまりを目安とする推定。既存U6のEntity同一性・Chat取込・総合一巡とは別の残件である。Theme名やEntity別名等の言語は保存/API契約までで、全項目の言語編集UIや訳名検索は未接続。年表軸名・時期補足の個別言語指定も後続。
