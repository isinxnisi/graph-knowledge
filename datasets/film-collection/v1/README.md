# film-discovery-v1 — 隔離した候補レビュー
状態：未採用Role・未受入映画候補。既存Workerや収集承認registryへ登録していない。

[人間向けの判断待ちレビュー](trial/README.md)／[preflight](trial/preflight.json)／[固定本文・依存](trial/review/proposed-records.json)／[未承認decision](trial/review/decision-draft.json)。

初回は既存3作品・12候補に限定し、人物別原役割を追補した2 Claimを判断対象とする。候補はhidden、保留10件はそのまま残す。判断用UUIDは既存研究fixtureの一時UUIDを流用せず新しい仮namespaceで生成し、最新照合で既存UUIDを特定した場合だけ再利用する。正式IDへの確定は未実施。

recipe.jsonは保存済み研究・#40 fixture・狭いRole案・追補・比較indexのbyte hashを固定。trialのbindingはcollector／validator・解釈に必要なschema／語彙依存も固定する。出力を上書きせず、同じ入力はbyte一致で再利用する。

comparison.json.gzは保存済み本番backupと全参照を検査した正式receipt 10件の凍結index。公開・撤回・正式受入済み未公開を区別する。現在のlive本番観測として使用しない。evidence配下には最小の人物別credit抜粋だけを保持し、元の研究記録は変更しない。

実行：
~~~sh
npm run film:test
npm run film:prepare
npm run film:e2e
python3 scripts/collect-film-v1.py verify --output datasets/film-collection/v1/trial
~~~

prepareの既定出力はGit外の.local/collection-trials/film-discovery-v1。結果はこのtrialと同一。film:e2eは通常の語彙catalogを変えず、一時ソースと使い捨てDB/Webでだけ提案Roleを有効にする。

[全体結果と次の判断](../../../docs/research/film-collection-issue41/README.md)。
