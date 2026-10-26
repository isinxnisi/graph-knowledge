# 正式採用・受入へ進むときの変更境界
今回完成したのは隔離版film-discovery-v1の候補→レビュー→preflight。正式承認の適用、既存Workerへの登録、本線へのmergeは実装・実行していない。

| 次段階 | 必要なファイル・判断 |
| --- | --- |
| 意味語彙の正式採用 | lib/domain/contribution.ts、lib/i18n/contribution.ts、vocabulary/contribution-roles/catalog.jsonとreviews.json。運営者が定義・比較・scope境界を判断した実際のreviewer／日時とhashを使う。baselineと旧approved票は不変 |
| 映画reviewの正式受入入力 | scripts/collection-workflow.pyとcollection-acceptance.pyに映画固有review kindの明示dispatchが必要。現在のdraftは既存accept-releaseへそのまま渡す形式ではない |
| 新規Entityと仮UUID | 今回は人物1・作品2の依存が必要。saved-evidence-v1初版の「既存Entityだけ・1 Claim」枠へ偽装しない。最新公開＋全receiptで同定・重複・撤回・scopeを再比較し、最終ID対応を固定して本文hashを更新 |
| schema／語彙hash | 現行受入cacheのpublic-dataset.ts＋fixture.tsだけのhashに対し、実際に解釈するcontribution／evidence／dates／資格型／Predicate等と採用語彙を束縛する。今回の実験はこれらをbindingへ含め、旧結果の使い回しを拒否する |
| 収集承認・漫画との互換 | 既存manga v2のcode hashにはcollection-themes.pyが含まれる。共有gateを後日変更する場合は、新旧版のdispatchと承認の移行案・漫画回帰を先に用意し、旧承認を同じ名前で上書きしない |
| 自動Worker接続 | 初回は手動の限定映画recipeを推奨。既存Workerの更新は別の明示作業。新adapterの通信予算・code/input hash・上限・再開条件を承認してから登録 |
| 公開準備・配置 | 個別正式受入の後、通常のrelease validate／最新無書込planへ接続。公開apply、main受入、beta・VPS配置はさらに別指示 |

2 Claimのscopeはnullのまま「未構造化」。特定cut／地域／言語を表現する必要があると判断された場合は今回の固定レコードを承認せず、scope設計と新reviewを先に作る。資料の表記Dir／CASTを他工程や声・吹替へ広げる判断も本案には含まれない。

現在のbundleはdraft-not-approvedで、機械生成のreviewer・humanDecisionを持たない。採用時に内容・UUID・依存・語彙版が変われば新しいreviewとdecisionを生成し、今回のbundleを上書きしない。
