# 映画2 Claimの正式受入判断票

2026-10-27。Role正式登録 e7e1a8d5 後の固定コードと、運営者が取得した本番完全backup・全10正式receiptに基づく。**人間のClaim受入判断は未記入、正式receipt・本番公開は未実施**。Roleの再承認は不要。

[固定判断ファイル](claim-decision-for-review.json)のSHA-256:

    6bdc6af8165719975b57bb132c0188a18f18712fecf0cf1a93945b794a3747b6

[審査manifest](formal-review/review-manifest.json)のSHA-256:

    ebb44d4e64872da5c843939067944123c1eb0bc16d1da1482db4ad597d41af65

[本文・依存record](formal-review/proposed-records.json)／[全コード・本番比較binding](formal-review/context.json)／[照合・検証結果](role-registration-and-claim-readiness.json)。Gitのreview写しは原runtimeファイルと同一bytes。完全backupはGitへ入れずprivateに保持する。

## 今回判断する2件

| Claim | 関係と原資料 | Claim本文hash |
| --- | --- | --- |
| 4c88b8e8-154d-47ad-bf82-f19876ecaebd | クリント・イーストウッド → 許されざる者、CONTRIBUTED_TO / ACTING / affirmed。[AFI Unforgiven](https://catalog.afi.com/Film/67274-UNFORGIVEN)の CAST / Clint Eastwood / Bill Munny。人物名と劇中役の対応があり、CAST見出しだけの判定ではない。 | 0661ca6c346efeb884e96b8e1fbe512100db3c9a4eecfcf73485461b162c494b |
| 34b41d23-f4e6-4fc6-aa6f-2905f3c2a890 | クリント・イーストウッド → ミリオンダラー・ベイビー、CONTRIBUTED_TO / DIRECTING / affirmed。[AFI Million Dollar Baby](https://catalog.afi.com/Catalog/moviedetails/54369)の DIRECTORS / Clint Eastwood / Dir。助監督等の別欄から推定しない。 | 5c9bac955699442bd0813caa23a1928ef82d35fb0fccd7cd39be21f4bda7a0a4 |

2 Claimとも contribution.scope=null、period.from/to=null。版・カット・地域・言語・期間は未構造化であり、「全てに適用」の意味ではない。公開年から期間を補わない。Million Dollar Babyの保存作品年2004とAFI米国公開2005の違いは同一作品の確認注記に残し、Claim期間へ転用しない。

保存済みAFI原文・locator・英語原役割表記・UUID・Claim本文は保持。Citationの注記だけ、資料採録時点の候補状態と現在の正式catalog／receiptを区別する文に明確化した。今回のCitation本文hashは固定判断ファイルを正本とし、旧研究草稿を承認済み票として流用しない。

## 依存Entityの正式UUID確定案

以下の3 Entityを、それぞれ記載した人物／映画の正式UUIDとして確定する。既存の別Entityとの自動mergeは行わない。外部IDは照合補助で、Role根拠の代用ではない。

| Entity | 種別・外部ID | UUID |
| --- | --- | --- |
| クリント・イーストウッド | person / Wikidata Q43203 | 490ee589-76db-4a5e-8923-13d24b7cb3a2 |
| 許されざる者（Unforgiven） | work / Q104137 | 604eb49e-df41-4157-8b49-bd92a0d93ad4 |
| ミリオンダラー・ベイビー（Million Dollar Baby） | work / Q184255 | 805b9630-cd9a-4931-8cde-0bcb92bf8a9f |

依存2 Source・2 CitationもUUID・本文hashを同じ判断ファイルへ明示した。追加対象は3 Entity／2 Claim／2 Source／2 Citationのみ。12候補中、残り10 Claimは保留し、追加採用しない。

## 機械的な照合結果

- 完全backup SHA: f6a716d7264ce1023d3f9100cbd7fa6bd628cd174d2d2412546a0e4e3938b2d3。
- base release: manga-issue-34-obata-drawing-20261023、live revision: b74a4b00-9454-412f-af5d-1317713a543c。
- schema/checksum/graph/既存公開履歴6件・公開artifact・全10正式受入receiptと参照資料を再照合。公開履歴6件と正式受入10件は別の台帳。
- 対象2 Claimの重複候補0。3 Entityの外部IDについて既存所有者0。159コードファイルと凍結入力の再検証に成功。
- 正式Role catalog10件、過去8定義・旧承認記録の値・baseline・研究草稿bytesを保持。
- status=draft-not-approved、humanDecisionの氏名・日時・statementはnull。identityDecisionは今回の**提案文**で、人間承認済みという記録ではない。local/beta/vpsのapplyAuthorizedは全てfalse。

decision-requestのadoptionBlockersは既存CLIの固定チェック項目一覧であり、現状の承認台帳ではない。Role項目は上記正式catalog/reviewsで充足している。現在残る意味判断は、この2 Claimと依存Entityの確定である。

## 人間に必要な次の操作

この会話で、上記固定票の2 Claim・依存3 EntityのUUID確定・2 Source／2 Citation・null scope/periodの扱いを、正式受入として承認するか判断する。SSH／sudo・手順書の全工程の手動実行は、この判断には不要。

承認する場合の明示例:

> 固定受入票SHA-256 6bdc6af8165719975b57bb132c0188a18f18712fecf0cf1a93945b794a3747b6 の映画2 Claim、依存3 Entityの正式UUID確定、2 Source・2 Citation、null scope／periodの扱いを正式受入として承認します。

この承認は本番applyの個別署名を含まない。承認後、Codexが実際の発言・時刻を記録し、共通hold・worker.lock・正常／非pause状態、最新revision・全receipt・全bindingを再確認して既存accept-filmを実行する。成功時は新規正式receipt1件、追加3/2/2/2、旧receiptと全旧recordの保持、release validate／offline plan成功、publicApply=falseを確認する。変更や衝突があれば自動合併せず停止する。

受入後はIssue #33の既存公開自動化へ接続する。正式catalog入りoperator/Webの候補はbuild済みだが、VPS/root trust更新・本番Web切替・個別固定request署名・本番KG applyは未実施。固定requestが存在する前に公開承認を先取りしない。

## 再開時の保管境界

原審査はruntime/datasets/film-collection/initial-20261027-final/、実行コードは独立worktree graph-film-initial-release。原recipeは同worktreeの .local/film-release/role-approved-20261027/recipe.json を参照する。正式受入が終わるまで、このworktreeと非公開.local入力を保持する。未受入の旧role-approvedレビューは履歴であり、今回のfinal票だけを使う。

入力保管・状態表示の後続改善は[Issue #53](https://github.com/isinxnisi/graph-knowledge/issues/53)。今回の公開を妨げない改善を、この判断の追加条件にはしない。
