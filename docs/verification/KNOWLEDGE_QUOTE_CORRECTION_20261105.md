# 引用・記載箇所だけの訂正と、多言語の設計確認

2026-11-05。多言語の原語・翻訳・訂正に関するユーザー指摘を受け、現行の保存構造を確認した。[多言語の案](../design/KNOWLEDGE_MULTILINGUAL_PROPOSAL.md)は採用待ち・未実装であり、今回の機能修正とは分ける。

## 修正

直前の重複対策が、明示的な訂正でも本文の意味が同じ場合に根拠追加の処理を使い、既存の引用・記載箇所を残していた。結果として、引用だけ／記載箇所だけを訂正する提出内容が反映されなかった。

受理計画に、検証済みの投稿操作を保持する。明示的な `correct-record` は、提出した引用・記載箇所を次のRecord版へ反映する。別Recordとの意味重複拒否、参照版・原資料照合、変更なし訂正のno-opは維持する。新規の同じ意味の投稿と `add-evidence` は、既存文・引用を保って独立資料だけ追加する。

schema・migration・AIプロンプトの変更はない。多言語の言語属性・翻訳版・翻訳訂正機能を実装した意味ではない。

## 検証

- 隔離会員／知識PGとOIDC・原資料fixture：48件成功。引用のみ、記載箇所のみの訂正が次版になり、旧版と訂正者の帰属が残る。変更なし訂正・新規重複は版や活動を増やさない。
- 隔離PGの重複統合・受理計画・重複判定：30件成功。同じ資料への根拠追加は引用を上書きせず、独立資料だけを追加する。明示訂正と追加の境界を確認した。
- 変更した3つのTypeScriptファイルのESLint、`git diff --check`成功。
- Node 24でNextの完全build・型検査成功。3084 tracked filesを配置元SHAとbyte照合し、既存build cacheだけを再利用した。外部AIへの追加送信は0件。

## 多言語の現状

UIの日英切替、安定ID、内容版・資料pin、公開投稿者・訂正者の帰属は存在する。Record本文・関係語・Theme名・引用について、原文と翻訳を別版として保存する仕組みは不足している。Entity／Sourceにもja既定の生成経路があり、実際の原語の証明として使えない。

設計案ではUI・投稿文・資料・引用・翻訳先の言語を分離する。事実の訂正、訳文だけの訂正、根拠引用の訂正を別対象とし、原文を保持する。翻訳は段階導入、既存利用枠へ別用途で接続する案。自動翻訳の精度・費用を検証済みとは扱わない。

## 配置・実ブラウザ・保全

- app source `1f1efd3fee5ced1075b8b5b571c88ef23cfb5396`、build `FECRlX7I0yAs_6MVqAN8P`。mainをfast-forwardし、3200のWebと投稿受理を動かす既存Workerを更新。同じlauncher・private profileを使い、設定hash不変。3276／本番VPS／共通Kev／Cloudflaredは未変更。
- `http://localhost:3200/` と [HTTPS β](https://graph-beta.isinxnisi.com/) のdataset／投稿画面は200（通常ブラウザUAで照合。初回のPython既定UAは403）。実Googleの既存セッションで投稿結果を再読込し、「登録済みの知識です」から公開原記録へ進み、元の投稿者Badge・内容版1・NASAリンク・英文引用・記載箇所・訂正入口を確認した。
- 引用だけ／記載箇所だけの訂正操作と帰属・履歴は隔離OIDC／原資料fixtureで確認。今回の実Googleでは既存原記録を閲覧した。実資料の引用をQA目的で変更したり、新しいAI審査を発生させたりしていない。
- 切替前に会員・知識のcustom dumpを別途保存。直前のsnapshot付き別DB復元・全table指紋一致の検証を再利用（今回はmigrationなし）。切替前後で26 Record版・5 Theme版・25 Capsule・会員ledger29件の内容hashが不変。backup・復元先はprivate `.local/submission-repair` に保持する。
- [機械可読の検証要約](assets/knowledge-quote-correction-20261105.json)。多言語の自動翻訳精度・異言語での訳文訂正は未実装・未検証。

再開は `docs/runbooks/KNOWLEDGE_BETA.md` の既存launcherを使う。古いdumpへ戻さず、現在のledger・source・buildと照合する。
