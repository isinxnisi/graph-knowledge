# 制作中テーマの非公開化：検証と配置記録（2026-11-18）

## 現在地

設計・実装・隔離試験・build・β配置と公開境界確認を実施。本番は資材転送と現地SHA照合までで、追加migration／切替／ドラゴンクエストの非公開化は本人sudo入力待ち。運営者プレビューのPC／スマートフォン実画面と、Appのツール更新後の画像付き読取は未確認。予定実行を検証済みとはしない。

実行source `52aeced622e3bbd3b6655c4000098047c36c0d23`。βbuild `2jvdBAkNF0hibHgPo9jqz`、正式候補 `mX5Ty2YU9Jw7NlYdW8llV`。追加するDBはmember045／knowledge010だけ。既存checksumは固定sourceと照合。現在本番は5e9794eaのまま。

## 設計とAPI

[現行設計](../design/THEME_PRIVATE_PUBLICATION_20261117.md)。新規Themeは公開headを持たず、承認したTheme版とTheme専用訳文・画像参照だけを公開releaseに保持。公開済みThemeの新しい作業版／訳文は前の承認表示を置き換えない。承認された過去版・過去訳文参照は保持する。現在の原資料・共通知識の撤回を優先し、テーマの非公開化で共通知識を連鎖非公開にしない。

案件の正常なreview完了と公開意図を同一member transactionへ保存し、知識DBへの切替直前にも対象digest・ガイド・商品・訳文・実行状態を検査。失敗時は非公開／旧承認版を保持し、`publication.pending` と同一completion command再送で回復する。GETだけで公開を再実行しない。

- `read_theme`：認証済み運営者は作業中の版を読み、`publication`／`previewUrl`を取得できる。`includeImages:true`を新しいMCP schemaへ追加し、認証済み読取に紐づく最大2言語分の挿絵を返す。
- 既存の登録・更新・訳文・受付照会・案件claim/save/assess/completeを利用。新しいMCP操作は追加しない。運営登録からAI審査へ接続しない。
- `check_theme_publication`：非公開・作業中と一般公開済みの確認を分離。公開前の404を公開済みと報告しない。
- `/operations/themes`：有効な運営者だけがThemeの制作／見直し／公開状態と、自分の案件の進捗・残件を閲覧。個別previewは通常Explorerを再利用し、認証付きnoindex／no-store。一般会員と匿名には返さない。

## 試験

ホストの隔離DB：制作・公開制御25、運営登録32、訳文／一般投稿制限30、画像・権限・MCP16、言語公開・SEO37が成功。TSC、ESLint、diff検査、βと本番imageのbuild成功。実際の固定sourceのknowledge-ops imageでも、隔離したPGへ制作22・訳文16・言語16の計54件が成功。いずれも実本番への試験データ登録ではない。

検証内容は新規非公開、旧承認版維持、未承認版の指定拒否、Theme訳文固定と過去承認訳文、公開切替失敗／同一意図の再送、評価後の変更拒否、旧完了案件の再見直し、DQ指定だけの非公開移行、共有共通知識維持、運営AI送信0／一般投稿審査維持を含む。

HTTPSβの検証用Themeだけを正規の運営登録APIで作成し、次の匿名15経路を確認した。実PLUTO・黒澤・G07や本番案件の編集は行わない。

- public Theme／旧版API、日英正規URL、旧版URL、日英OGP、専用画像、運営一覧／preview画面／preview API、Theme商品の12経路は404で、検証用本文を返さない。
- sitemap・公開Theme一覧は200、未公開Theme IDを含まない。既存7公開Themeの一覧を維持。
- 旧query URLの外枠は200だが非公開の本文をSSRへ埋め込まない。取得APIは404。
- 既存βAppから`read_theme`で同じ非公開Themeを読め、`publication.state:private`・公開版null・preview URL・共通知識の固定版を確認。現在のCodexのApp定義は旧schemaで、追加`includeImages`は通らず画像content未確認。サーバー内試験と実接続を区別する。

ブラウザ操作はComputer Useでログイン済みChromeを選択したが、次の操作時に現在URLを確定できず安全停止。別経路でユーザーのCookie／プロファイルを取得する迂回はしていない。PC／スマートフォンの認証プレビュー実画面、iPhone実機は未確認。

## β配置とバックアップ

βmember／knowledge DBのpg_dumpを取得し、追加045／010を適用。旧table owner・既存行を比較して保持。βknowledgeのledgerは旧8→9、memberは45→46。本番は旧knowledge9→10になる。既存SQLの書換えではない。

最初のβバックアップ後の大きなJSON行digestが長時間になり、約10分のβ停止を生じた。担当の読み取りhash queryだけを条件照合して中断し、DBを変更せず再開。切替前後の旧知識行の比較を同一DB内のctid／xminへ変更し、migration・build切替・既存5 Worker再開を完了。共通データの削除や公開世代の整理は行っていない。本番の隔離復元では論理行digestを使い、切替時だけ同一DBのtuple identityを用いる。

βの旧build、DB backup、保持比較結果はGit対象外の`backups/theme-private-production-20261117/`へ保存。βデータを正式へコピーしない。

## 本番の配置内容と復旧

固定image2点と追加045／010、検証済み既存補助script、新規`release-theme-private-production.py`をdevelop所有のprivate stageへ転送し、全SHAを現地で照合済み。archive589,982,581 bytes／SHA `1ae094fbf8d7b94af7b2524e96005184ed446be67ed6d6282203b633eea9052c`。

本番手順は現行Composeの信頼済みbackupからの差分・private設定hash・image/build・DB ledgerを再照合し、稼働中に両DBを同一snapshotごとにbackup、隔離PGへ復元して045／010・owner／旧行・再適用を試験する。その後Webと既存3 Workerを停止し、最終backup・暗号化・migration・固定image切替。新Workerやcronは追加しない。既存のimage aliasも同じ固定ops sourceへ整合させる。秘密の設定値は出力しない。

DQのTheme IDだけを公開release backfillから除外。Theme本文・版・Record／Entity／Source・訳文・商品・画像・会員・Capsuleは削除しない。本番品質ガイド本文や予定はこの配置scriptで変更しない。

適用後は旧Webへの自動downgradeや旧dumpの自動復元を行わない。新公開境界を理解しない旧Webでは非公開が漏れるため。migration後に切替失敗なら安全のためWeb／Workerを止め、新しい公開境界を維持したまま前進復旧する。暗号化backup・key envelope・old images・private設定・checkpointを保全し、実行後にPCへ暗号化backupを回収する。

既に検索エンジンや第三者へ配信済みの本文／画像は取り消せない。反映後の元URL404・no-store・サイトマップ除外を確認し、Google等の残存Index／外部cacheの即時消去とは区別する。必要なら所有者のSearch Console削除要求等は別途行う。

## ガイドとChatGPT予定への正確な変更

βDBの品質ガイドは4→5版で非公開制作と承認公開の手順だけを追記し、6版で今回追記の改訂日を修正。本文v1.4.1、別読取で全文一致を確認。既存の品質観点は保持。本番DBは現時点で保存4版／本文1.6のまま。本番反映後に最新を読み直し、第9節の「公開前の見直し／公開後の正規GET」の関係だけを整合させる。β本文を本番へコピーしない。

予定設定は変更しない。通常ChatGPT予定の制作側・見直し側の指示に、次を追加する必要がある。

```text
制作中・独立見直し中のTheme固有情報は非公開。登録のpublishedは作業版への反映であり一般公開ではない。
作業版はread_themeと認証済み運営者previewで確認し、挿絵はread_theme(includeImages:true)でも取得する。
制作側は必要な登録結果を確認して見直しへ引き継ぎ、公開確認の404だけで停止しない。
独立見直し側は現行評価対象とガイドを用いて修正・反映後の全体を再評価する。
現在の全体passと未完・反映待ちなしを確認し、reviewの制作案件を正常completeする。
publication.pendingなら返された正確なretryCommandで再送し、案件GETだけで公開を始めようとしない。
承認公開の切替後にcheck_theme_publicationと日英の正規URLを確認し、確認できない点は未完として残す。
```

既存の本番・βAppで「ツールを更新」が必要。ID・endpoint・OAuth権限を変更／再作成する必要はない。実ChatGPTで追加schemaの認識・画像付き作業版読取を確認するまでは、App接続完了や予定実行確認済みと報告しない。
