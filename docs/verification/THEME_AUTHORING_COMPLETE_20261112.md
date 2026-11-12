# テーマ一式のAPI登録・更新確認（2026-11-12）

## 現在地

①保存契約・②実装／β確認・③既存β Appの更新と実会話での添付登録→商品更新→同一テーマ更新まで完了｜今回の経路確認は③まで。本番未変更。新規テーマ作成は統合試験で確認し、実ChatGPTは既存テーマ更新で確認した。試験用の重複テーマは作っていない。

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

## 実ChatGPT確認で止まった地点（修正前の履歴）

既存の専用会話を継続し、既存beta Appの管理でツール更新と再接続を試した。ツール更新は「アプリを更新できませんでした」。再接続先ではPlunodeがChatGPTのclient metadataを5秒以内に取得できず、invalid_client／Metadata document fetch timed out after 5000msになった。添付の処理や本人同意の画面には到達していない。

このPCは再起動復帰の時点から、Windows側HTTPSは利用できる一方、WSL側の外向きTCP timeoutが残っている。[既存記録](PC_RESTART_RECOVERY_20261112.md#WinNat操作後の復帰と残件)。今回の失敗との同一原因は断定しないが、具体的な停止箇所はメタデータの外向き取得である。TLS検証の無効化・偽メタデータの固定・権限の直接書換えによる回避はしていない。

再接続URLが要求するscopeもoffline_access／missions:collectで、旧collection用のまま。接続が戻ったら既存beta Appのmetadata／compose scopeを正規の更新・本人同意で整え、新操作一覧を確認する。次に二つの添付画像をupload_editorial_imageへ渡し、同一テーマへの更新と新規作成を実会話から確認する。現在のAPI経由の7版を「実ChatGPTから登録済み」とは報告しない。

③の残りは接続復旧後に1バッチ目安。ネットワーク復旧自体の時間／本人同意の待ちは別であり、確約しない。本番への反映・正式App変更は別途承認のまま。

PLUTO ZIP元依頼の未公開G05／N05（2件）は今回の汎用経路の実装とは別に通常再試行待ち。受理条件や利用量を迂回していない。

## 最終検証と配置（初回配置時の履歴）

- 追加／関連unit 14件、隔離DBを使うtheme-registration統合25件が成功。明示migrationと再実行、公開前予約、公開後の旧版保持、画像GC、他テーマ参照の拒否、受付再送、処理中競合、接続権限の分離を確認した。unitと統合に重複するsuiteは単純合算しない。
- 関連TypeScript／TSXのESLint、型検査を含むproduction build成功。最後の引継参照整理で構文エラーを検出し、修正後に対象unit・統合・lint・buildを再実行している。
- 最終build `MGxwzESwlt2PfPhUEXpBn` をローカル3200へ配置。HTTPS βの同じ7版のSEO本文が200で、そのbuildとDB保存画像URLを確認。画面記録は同じUIの直前buildで行い、最後の変更は記録を外した場合の内部参照整理のみ。
- 既存のreview／publisher Workerを対象PID・cwd・scriptの一致確認後に再起動。共有Kev、他サービス、Windows task設定、本番VPSは変更しない。
- 実ChatGPTのfile input転送・新しいcompose権限の接続・添付からの新規作成／同一Theme更新は未確認。③を完了扱いにしない。

## 接続修正と既存App更新（同日追補）

- Windowsではchatgpt.com/oauth/client.jsonが200、WSLではDNS成功後のTCP接続がtimeout。開発βの明示opt-inでWindows標準curlを利用するtransportを追加。公開IPv4を固定し、TLS検証・host allowlist・redirect禁止・時間／容量上限を維持する。URLはstdinに渡し、argv／一時file／ログに署名URLを出さない。取得実測はmetadata200／447ms、JWKS200／228ms。
- 当初のApp更新では、認証tokenの発行は200でもMCP認証が401だった。MCP middlewareが自分の公開JWKSも外部URL経由で読むため、同じWSL障害に当たっていた。β opt-in時だけ同じWebの固定loopback endpointから公開鍵を取得する。issuer／resource audience／署名／expiry／scope／DPoPはそのまま検証する。
- 別に標準時より約1.92秒遅れ、W32Time停止を実測。本人がサービス起動とresync /rediscoverを実行し、標準時との差が約0.0003秒へ戻った。同期後はclient assertion検証が200になった。JWTの検査を緩めていない。
- 認証済み運営者には23操作の定義を返せるようにし、各authoring操作へscope metadataを追加。未同意の実行はinsufficient_scopeのOAuth challengeだけを返し、dispatchしない。収集専用tokenの無断昇格はしない。
- 同じApp ID plugin_asdk_app_6aef2b97439081919c3828f9080c4c6fで「ツールを更新」が成功。実Appの画面でWrite13／Read10、submit_theme／update_theme／upload_editorial_imageを確認。サーバーの実要求もtools/list200／23操作。新Appの作成、正式App／定期実行設定の変更はしていない。
- 既存の資料収集会話からβ限定でget_theme_authoring_guideを要求。接続画面はoffline_access missions:collect themes:composeを要求し、本人の同意画面へ到達。この時点では本人同意待ちだった。以下の最終確認で本人同意と実書込みまで完了した。
- 関連unit25件と、固定loopback鍵取得でも正しい署名だけを通し、異なるissuer／audience／期限切れ／別署名を401、別scopeを403とする暗号署名試験1件が成功。関連ESLint／型検査込みbuild成功。
- 現在build uKzgYwYaCEm9IFd_ZulQN。ローカル3200とHTTPS βの既存7版本文を確認し、実画面で挿絵・商品表紙・指定購入URLを保持。Webと対象review／publisherだけを再起動し、Windows task・共有Kev・本番VPSを変更していない。WSL全体の外向き通信障害を復旧済みとは扱わない。

本人同意画面：C:/Users/nishr/.codex/tmp/plunode-beta-connect-20261112/consent.jpg。

## 実ChatGPTからの添付登録・同一テーマ更新（最終確認）

- 本人がthemes:composeの同意とChrome拡張のファイルURLアクセス設定を完了。同じ専用会話・同じβ Appからget_theme_authoring_guideが成功した。
- 実際の添付はホストがfile IDをHTTPS参照へ展開していた。初回のFILE_REFERENCE_INVALIDは、OpenAIが今回使った配信ホストoaisdmntprkoreacentral.blob.core.windows.netの許可漏れだった。推測のURLを作った問題ではない。この観測済みホストだけを共通判定へ追加し、任意のAzureホストは許可しない。βの名前解決も期限付きのIPv4 resolverに分離した。署名付きURL全体は出力・保存しない。
- 修正build AhsakpwOg-tLShFzrpNFpを3200へ配置し、同じChatGPT添付を同じrequestIdで再試行。upload_editorial_imageが2枚とも成功した。そのままread_product→save_product→update_theme→get_theme_registration→read_theme/read_productを実会話で実行し、publishedを確認した。
- テーマは同じIDの7→8版、既存商品は3→4版。公開の8版を別途取得し、変更がreadingの画像参照とproductPinsだけであることを照合した。言語別のhook／lead／見出し／Entity説明／記録参照、recordPins、年表、根拠、商品名／短い紹介／購入URL／漫画Entityへの接続は一致。商品本体もimageId以外の変更なし。旧7版を引き続き読める。
- 挿絵IDは56df031b982484fd2a4898ee531b372ffcb1791ae91aad85b8f24dfe89cc60b4、表紙IDは78a271efc475ea4f2d009ca8b5809ad409fd085d2b237e31a8dbc5fd4b4c006e。ChatGPT経由でAPIが受け取った挿絵は1672×941／3,910,580 B、保存WebPは1600×900／385,096 B。JPEG表紙は745×1000／225,031 B→同寸法／182,976 B。ローカル原本とホスト配信ファイルの容量を混同しない。
- HTTPS βの実画面で構成版8、挿絵1600×900とカード用表紙477×640の読込完了、Amazonアフィリエイト／参加者表記、指定購入リンクを確認。画像の役割は分離され、実物表紙に紹介用イメージを付けていない。購入はしていない。
- 関連26件・ESLint・Python構文・型検査込みbuildは成功。最終画面は同じAhsakpwOg-tLShFzrpNFpで確認。Webと対象Workerのみ復帰し、共有Kev・Windows task・正式App・定期実行・本番VPSは変更していない。

画面記録：

- 実ChatGPT完了結果：C:/Users/nishr/.codex/tmp/plunode-beta-connect-20261112/chat-success.jpg
- βのテーマ8版と商品4版：C:/Users/nishr/.codex/tmp/plunode-beta-connect-20261112/theme8.jpg

未確認・別件：新規テーマ作成の実ChatGPT試験は未実施（新規作成の統合試験は成功）。iPhone実機は未確認。ZIP由来G05／N05の2件は通常の再試行待ちで、今回の画像経路確認によって完了へ変えていない。WSL全体の外向きTCP障害は未復旧。既存画像の全地域の配信ホストを網羅した保証はせず、未知のホストは拒否する。本番反映は別途承認。
