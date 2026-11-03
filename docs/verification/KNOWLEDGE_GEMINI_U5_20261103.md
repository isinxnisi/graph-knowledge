# U5：Gemini無料APIの実評価と通常自動受理の方針

2026-11-03。[現行設計と残件](../design/KNOWLEDGE_SUBMISSIONS_U5.md)。0.8Bの強制判定を外し、ユーザーが任意に参考にする助言とする。Geminiの実評価が成立する通常分は自動受理へ進み、全件人手承認を挟まない。今回、その方針・接続部品・結果ルールを作業branchへ追加した。**投稿UI・認証API・永続job・公開transaction・通知はまだ未接続で、U5全体の完了ではない。**

## 実接続と対象

- 既存Google AI StudioのPlunodeプロジェクト・既存キーを使い、画面でFree Tierを確認。プロジェクト／キーの新規作成、課金設定、利用規約への新たな同意操作はしていない。他プロジェクトは変更しない。
- APIのモデル一覧取得と生成APIで接続を確認。モデルは `gemini-3.5-flash-lite`、一覧でのversionは `3.5-flash-lite-07-2026`、生成応答の `modelVersion` は `gemini-3.5-flash-lite`。応答から固定weight revisionを特定できた意味ではない。
- `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`、API revision `2026-05-20`、構造化JSON、単一候補、LOW thinking、最大出力2,048。tools・Web検索・URL取得は無効。
- 既存20件と新しい40件の評価用非機密データだけを送信。入力は仮想の主張・抜粋。実会員情報、本人の投稿、私有Capsule、実資料本文は送っていない。
- キー・APIの生応答・送信wire・project台帳は、Git対象外の `.local/u5-gemini/` 内（directory 0700／file 0600）。キーはURL・ソース・公開結果へ含めない。commitする結果はresponse IDをhashへ置換し、project識別やキーを含めない。
- 共有Kevの推論・停止・モデル変更は今回0回。先行4Bの単発評価後に復帰した0.8Bを維持する。

Googleの[認証](https://aistudio.google.com/docs/api-key)、[モデル](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)、[生成API](https://aistudio.google.com/api-reference/generate-content)を参照。無料APIの[利用条件](https://aistudio.google.com/docs/terms)には入力・出力の改善利用等があり、実投稿の外部送信範囲はその条件に合わせて接続する。Chatの定額プランとAPIのFree Tierは別である。

## 評価方法

`data/knowledge-review-gemini-protocol.json` に通常自動受理の候補条件と工程上の接続基準を固定した。`legitimate + supported` を自動受理候補とし、schema有効回答95%以上、正常支持ケースの候補率85%以上、非受理期待ケースの誤自動受理0件を、この小さい試験での基準とした。実運用の統計的な安全保証や、誤判定が永久に0であることを要求する基準ではない。

既存20件は開発用。最初の接続試行後、新たに40件を作成・期待値固定し、同じprompt・判定基準で評価した。後者はこの開発評価での未見セットだが、人が同じ考え方で作った短いケース群で、現実の投稿分布を代表する無作為標本ではない。失敗後に期待値やpromptを変えて再評価していない。

40件には短い名称、作品名・引用・専門語、否定、正確／曖昧な時期、期間、複数の役割、英語、荒らし・宣伝・表記崩し、根拠なし・URLのみ、逆向き・役割・年の矛盾、部分支持・過剰な精度・因果の飛躍、資料内の命令文を含む。元資料の取得と抜粋一致の検証は含まない。

## 実測結果

| 項目 | 開発20件 | 未見40件 | 合計 |
| --- | --- | --- | --- |
| 有効回答 | 20/20 | 39/40 | 59/60 |
| 投稿適否の期待値一致 | 20/20回答 | 39/39回答 | 59/59回答 |
| 支持4分類の期待値一致 | 15/20回答 | 32/39回答 | 47/59回答 |
| 正常・支持ありの自動受理候補 | 6/7 | 12/13 | 18/20 |
| 非受理期待の誤自動受理 | 0/13 | 0/27 | 0/40 |
| 回答取得の中央値 | 1.054秒 | 1.213秒 | 1.131秒 |

最初の60送信では57回答（95%）。応答不明3件を120秒以上経過後に1回だけ追加試行し、2件を取得。最終有効回答は59/60（98.3%）、正常候補率90%。基準を満たしたため、**通常自動受理へつなぐGemini接続を採用して実装を続ける。** すべてを手動承認へ戻す判断はしない。

正常の残り2件は次の通り。

- `quotation`：引用・反差別の解説を含む展示の主張を、背景解説の支持不足と判定。荒らし扱いにはしていないが、期待より厳しい差し戻しとなった。
- `hold-period`：調査期間の正常な主張。最初と追加試行の双方で応答を取得できず、判定未確認。支持なし・不受理へは読み替えない。3回目の推論は行わない。

支持の不一致12件では、`unclear` と `unsupported`／`contradicted` の取り違えが多く、不明という資料を明示的否定と説明する例もあった。受理対象へ混ざった例はないが、理由文を「事実の誤りが確定した」説明として採用しない。資料の補足・確認を促す提案とし、本人が修正・再チェックできる必要がある。AI出力の適否・支持と、実世界の正しさ・資料の真正性を区別する。

ケース別の期待値・結果・理由・wire hash・モデル・usage・時間は[結果JSON](assets/gemini-review-u5-20261103.json)。prompt SHA256 `9f39de0538cb3c167f692e356b0d90d73eae7818ddae55d5cb4a51cee457685b`。有効回答でも最大58.206秒を要し、中央値だけをUIの待ち時間保証としない。

## 利用枠・失敗・消費

AI Studioで当日確認した当該モデルの実project上限は15 RPM・入力250K TPM・500 RPD。CLIはさらに12 RPM以下、80送信／Pacific日、入力予約250,000／出力予約160,000に制限した。この評価中に課金設定を有効にしていない。quotaは変わり得るため、将来の本番設定は[rate limits](https://aistudio.google.com/docs/rate-limits)と実projectを再確認する。

- 生成の送信試行63回、有効な受信59回、送達結果不明4回。論理ケースは60件、追加試行は3件に各1回。HTTP 429は観測していない。
- Pacific日付で11月2日28送信、11月3日35送信。JSTの日付と無料枠の日付を混同しない。モデル一覧等の読取は生成63回へ含めない。
- 取得できたusage合計：prompt 16,849、candidate 3,023、total 19,872 token。59応答すべてでthought tokenの個別値は欠測。欠測を実測0とせず、CLIは出力予約を残した（受信分120,832）。これは実消費量の主張ではない。
- 応答不明4試行は入力予約12,675／出力予約8,192を保持。元試行を消さず、追加試行は別に枠を消費する。
- 送信wireのbyte長＋余裕を入力予約に使った。正式tokenizerでの見積ではなく、この短文評価での保守的な予約値。将来の本番入力の正確なtoken数・課金上限保証へ流用しない。
- 通信例外は `delivery-unknown` として保持。HTTPの制限応答を観測できたものではなく、正確なネットワーク原因は未特定。課金・消費がなかったとは報告しない。

同じ出力先での再開は既存回答を再利用する。2連続の新規通信失敗でcircuitを開き、HTTPエラー時は新規送信を停止。`--retry-unknown` は待ち時間経過後に1回だけ新試行を作る。元の記録と予約を残す。これは有限の評価CLIで、本番queue／lease／project全体の他用途消費を管理した実証ではない。

## 実装・検証

- Geminiへの1回送信と応答検証、APIキーの本文／URL混入防止、429・403・通信不明・打切り・schema不正・資料内命令を扱う10テスト。
- 通常自動受理、補足依頼、荒らし拒否と救済、取消・古いdigest・参照認可・入力不正・モデル未評価／応答待ちを扱う純粋な結果ルール6テスト。
- 先行投稿domain回帰5テスト。合計21件成功。今回の単体実行ではDB6件をskipした。投稿SQL・repository・migrationは変えておらず、先行の[実PG検証と別DB復元](KNOWLEDGE_SUBMISSIONS_U5_20261103.md#データ層の検証)を活用する。
- TypeScript `tsc --noEmit`、変更TSのESLint、保存応答のoffline再採点を実施。offline再採点で利用量台帳が変わらず、追加送信がないことを確認した。
- 本人Googleでの投稿UI→審査→公開の実操作、実資料の取得・抜粋照合、永続jobの競合・停止／退会・通知・βでの一巡はまだ未確認。

再採点はworktreeで `.local/issue75/node node_modules/tsx/dist/cli.mjs scripts/evaluate-gemini-knowledge-review.ts --cases data/knowledge-review-cases.json --output .local/u5-gemini/baseline --offline`。40件はcasesを `data/knowledge-review-holdout.json`、outputを `.local/u5-gemini/holdout` に変える。offlineはキー読取・API送信をせず、保持した入力hashが違えば停止する。

## 配置・引継ぎ

出発点は作業branch `codex/issue75-theme-foundation` の `6bc97228`、mainは `c49a7f25`。mainの未追跡 `memo.txt` を保護し、無関係な自動開発候補を取り込まない。自身のhold・token review／assertで作業を保護する。

今回は画面・Web APIへ未接続の部品と評価なのでmainへ統合・再build・配置はしない。3200／HTTPS βはU4 source `37ef826c…`／build `UV072kqFJC_JqEMIyOme6`、3276は同U4 source／build `vR5VoLRV33qIhkrJpHFnF` を維持する。3200／3276／HTTPS βのTOPは今回もHTTP 200、3276の公開知識状態はpendingなしを確認。βの日常確認先は [HTTPS β](https://graph-beta.isinxnisi.com/)、独立確認先は [3276](http://localhost:3276/)。今回は新しい投稿確認画面はない。本番VPS・会員／知識DB・KG・Worker・AIラボ・共有Kevを変更していない。

次は本人の投稿画面・受付APIと取消／停止／退会を接続し、続いて永続job・利用量・原資料との照合・自動受理transaction・通知をβへ通す。基本追加2〜3回以上の見積を維持し、各回の未完了範囲を明示する。原資料確認を人手全件承認へ置き換えず、取得できない場合も無言で止めず、補足・別資料・再処理の導線を返す。
