# 運営テーマ登録からAI審査を分離（2026-11-13）

## 問題と是正

ChatGPT運営APIで作成・更新したテーマのpackageを、原資料検証と共用した `knowledge-import` のAI審査へ送っていた。訳文APIも一般投稿の審査キューを共用していた。これは運営によるシステム投入という依頼に反する実装ミスである。以前の設計書の共通AI審査記載は利用者の承認根拠ではなく、今回の是正で訂正した。

- テーマ受付・web配送・所有者・receipt・元packageのDB上の対応で運営専用の処理を選ぶ。任意のpayload・namespace・web prefixだけでは選べない。
- 原資料HTTPS取得／引用照合・構造・参照・公開範囲・版競合・正規化重複／既存Record再利用を残す。AI requestの作成・予約・送信・判定を運営登録の公開条件から外す。
- 運営訳文は固定原文・hash・公開文脈・expectedRevisionを確認して直接保存。私有の受付・所有者・過去版・取消・再送と既存Capsuleを維持。旧公開済み審査結果は履歴として保持し、再公開しない。
- 一般投稿キューはserver marker `operator-api` をauthorize・claim・canSendで拒否。一般ユーザー投稿のAI審査、自動収集・整理、依頼された訳文自動生成は別経路として維持。
- AGENTSと現行設計・Appから読むguideへ境界を明記。追加migrationなし。

## 検証

使い捨てPostgreSQL fixtureで、実装の通常サービス関数を実行。外部AIを実呼出しする再試験はしていない。

- テーマ登録suite 30件成功：新事実＋資料URL・Entity・年表の構成、同テーマ更新・同一知識の再利用・旧版保持、AIプロジェクト停止中でもAI callback／import attempts 0、取得失敗時は未公開、偽装的な一般web配送では通常AI処理、取消・権限・競合・再送。
- 訳文統合13件成功：新規／訂正・原文とTheme/Capsule保持、AI feature無効でも登録、一般審査への誤接続拒否・旧job送信拒否、旧公開済み履歴の互換・private所有者・公開帰属なし、capture後の取消・応答喪失／再送。guide unitは旧Google送信期待が1件失敗したため、是正後契約の `aiReview:false`／`externalAiTransmission:false` へ更新し、4件成功を再確認。
- 一般取り込み39件成功、一般投稿・参照64件成功。通常側の審査・予算・資料確認・公開を保持。
- 変更対象eslint成功、型検査込みproduction build成功：`Or2YQ9OYCQ3RtY56T3Jey`。

## βへの反映と既存受付

ローカル3200のWebとβ review Workerだけを通常停止・再起動。旧runtimeは `/tmp/operator-noai-runtime-before-1794513565` へ保全した。共有Kev・Docker・正式VPS・正式API用PC Workerは変更していない。

- localhost3200／HTTPS β TOPは200。
- 接続中の既存β Appで `get_theme_authoring_guide` 成功。運営登録のAIなし契約・訳文登録の外部AI送信なしが返る。App再作成・再同意なし。
- 同じAppの `get_theme_registration(f554935a-bcb2-4d67-b01f-bfb90377f456)` 成功。receipt `4cab5e05-a788-4173-b058-aa5df22a1b57` を維持。DB上の受付は新しい運営経路へ分類される。
- 切替前後で元入力hash・画像ID・商品参照・項目input_digest／normalized／result／状態・原資料試行回数／AI履歴／次回時刻を照合し不変。新しいテーマや試験の公開データは作成していない。
- G01/G04/G03/G02/G05は既存の公開済みを保持。各1回の過去AI送信記録を消して0回に見せる補修はしていない。今回の追加AI送信は0。
- G07はCriterionのCloudflare 403後、原資料準備8回の日次制限待ち。今回は追加取得なし、次回2026-11-13 17:00 JST。403を成功扱いせず、原資料確認を省略しない。
- T01/T02/D02/T03は入力不足のまま。利用者指定の別作業であり変更なし。テーマ全体はprocessing／theme:nullのまま。

新規の実ChatGPTテーマ登録・実訳文登録は今回繰り返していない。新経路の正常適用は隔離統合試験、配置後は既存Appのguideと同じ受付の読戻し・通常Worker稼働で確認した範囲を区別する。本番反映はしていない。G07の解消・入力不足4件の修正は今回の経路修正完了と別の残件。
