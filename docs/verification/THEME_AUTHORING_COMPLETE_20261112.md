# テーマ一式のAPI登録・更新確認（2026-11-12）

## 現在地

①保存契約完了・②実装／検証／β反映・実表示確認完了｜③実ChatGPTでの添付・作成・更新は接続障害で未了｜全体は③まで。本番未変更。内部の処理が動いたことを実ChatGPTの成功と取り違えない。

## 保存・APIの変更

- 任意のThemeにpresentationを保存できる。導入・短い見出し・説明のRecord参照・Entity説明・言語別の挿絵が原本版に含まれる。旧版／Capsuleに独立したGitの新規追記を要求しない。
- upload_editorial_imageは公式の四つのfileプロパティとfileParamsを宣言。既存の画像検査・圧縮・不変保存を再利用する。
- search_products／read_product／save_product／productPinsを接続し、同じ商品を重複作成せず画像や購入先を追加できる。read_themeは商品版と既存presentationも返す。
- migration040をβの会員DBだけに適用。適用前の整合backupと既存migration checksum一覧を.local/theme-editorial-20261112へ保存。過去のchecksumは一致した。
- 公開画像route、publisher、SEOのOG画像を同じ画像IDへ接続。公開前の予約と公開後の全旧版をGCから保護する。

## 実データで通った範囲

HTTP画像登録は10分の内部試験sessionで実際のOrigin／運営者検査を通し、finallyでsessionを削除した。MCPは実transport handlerに通常のoperator dispatchを接続して実行した。**ChatGPT Webから呼んだものではない。** API経路自体にPLUTO固有分岐はない。以下は受入素材にPLUTOを選んだ結果。

- receipt `07005601-7ddc-48a3-b871-d9d0d7621cb0` はsavedから通常のWorkerでpublishedへ進んだ。除外キー0。同じTheme idの6→7版。7年表・4note・8関係／9Entity・12出典の収録内容は継続。
- 商品`book:pluto-complete-8-b002de6u7i`を検索・再利用し、2→3版へ更新。表示名・短い紹介・Amazon購入URL・漫画Entityへの接続は維持し、表紙画像だけ新しい内部provenanceへ接続。原典・舞台・アニメの商品として扱わない。
- 挿絵と表紙の役割を分離。公開カードに「利用者提供の表紙画像」という内部メモは出さない。実物表紙へ「紹介用イメージ」を誤表示しない。Amazonアフィリエイト／参加者表記は既存の表示を保持。

| 素材 | 元寸法／容量 | 保存寸法／容量 | thumbnail容量 |
| --- | --- | --- | --- |
| テーマ挿絵PNG | 1672×941／3,224,150 B | WebP1600×900／385,096 B | 76,942 B |
| 商品表紙JPEG | 745×1000／225,031 B | WebP745×1000／182,976 B | 84,704 B |

画像ID：挿絵c1b275a4725741e9bb1537ddffb30602d7b2999783fe9091ec74c75566f00b45、表紙bccc2999aa6d936581e7b5d8784825667e79628413276fbfccfa135a171ab4bf。

ローカル3200のSEO本文6版・7版、7版のOG画像はHTTP200。HTTPS βではPC1500pxと375pxで、挿絵・商品表紙のnaturalWidth／Heightとcompleteを確認、横溢れなし、購入リンクは指定のlink.amazon/B0iJNnc7U。購入は行っていない。iPhone実機は未確認。

画面：

- PC：C:/Users/nishr/.codex/tmp/plunode-theme-api-20261112/pc.jpg
- スマホ幅の導入：C:/Users/nishr/.codex/tmp/plunode-theme-api-20261112/mobile-theme.jpg
- スマホ幅の商品・表記：C:/Users/nishr/.codex/tmp/plunode-theme-api-20261112/mobile-product.jpg

## 実ChatGPT確認で止まった地点

既存の専用会話を継続し、既存beta Appの管理でツール更新と再接続を試した。ツール更新は「アプリを更新できませんでした」。再接続先ではPlunodeがChatGPTのclient metadataを5秒以内に取得できず、invalid_client／Metadata document fetch timed out after 5000msになった。添付の処理や本人同意の画面には到達していない。

このPCは再起動復帰の時点から、Windows側HTTPSは利用できる一方、WSL側の外向きTCP timeoutが残っている。[既存記録](PC_RESTART_RECOVERY_20261112.md#WinNat操作後の復帰と残件)。今回の失敗との同一原因は断定しないが、具体的な停止箇所はメタデータの外向き取得である。TLS検証の無効化・偽メタデータの固定・権限の直接書換えによる回避はしていない。

再接続URLが要求するscopeもoffline_access／missions:collectで、旧collection用のまま。接続が戻ったら既存beta Appのmetadata／compose scopeを正規の更新・本人同意で整え、新操作一覧を確認する。次に二つの添付画像をupload_editorial_imageへ渡し、同一テーマへの更新と新規作成を実会話から確認する。現在のAPI経由の7版を「実ChatGPTから登録済み」とは報告しない。

③の残りは接続復旧後に1バッチ目安。ネットワーク復旧自体の時間／本人同意の待ちは別であり、確約しない。本番への反映・正式App変更は別途承認のまま。

PLUTO ZIP元依頼の未公開G05／N05（2件）は今回の汎用経路の実装とは別に通常再試行待ち。受理条件や利用量を迂回していない。

## 最終検証と配置

- 追加／関連unit 14件、隔離DBを使うtheme-registration統合25件が成功。明示migrationと再実行、公開前予約、公開後の旧版保持、画像GC、他テーマ参照の拒否、受付再送、処理中競合、接続権限の分離を確認した。unitと統合に重複するsuiteは単純合算しない。
- 関連TypeScript／TSXのESLint、型検査を含むproduction build成功。最後の引継参照整理で構文エラーを検出し、修正後に対象unit・統合・lint・buildを再実行している。
- 最終build `MGxwzESwlt2PfPhUEXpBn` をローカル3200へ配置。HTTPS βの同じ7版のSEO本文が200で、そのbuildとDB保存画像URLを確認。画面記録は同じUIの直前buildで行い、最後の変更は記録を外した場合の内部参照整理のみ。
- 既存のreview／publisher Workerを対象PID・cwd・scriptの一致確認後に再起動。共有Kev、他サービス、Windows task設定、本番VPSは変更しない。
- 実ChatGPTのfile input転送・新しいcompose権限の接続・添付からの新規作成／同一Theme更新は未確認。③を完了扱いにしない。
