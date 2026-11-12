# PLUTOテーマのβ登録（2026-11-12）

## 現在地

①既存版・公式資料の照合完了。②19/21記録を構成版4へ反映し、商品追加後は構成版5、画像追加後は構成版6。③表示用catalogue・37テスト・lint・型検査込みbuild・3200／HTTPS βの代表経路確認完了。全体は③までだが、未公開2件が残り、依頼全体は未完了。

## 登録先と保存結果

- theme ID: `theme:df8040bd38f635390870263b9f50b557e9be444f53695e06`、現行構成版6（商品追加前は4、画像追加前は5）。
- 年表7件、制作秘話4件、新規関係5件、既存関係3件を再利用。9 Entity・12 Source断面。
- 原典の連載1964〜1965／1965年5月の改題／2003年9月5日の連載開始／単行本1・8巻／東京公演／Netflix配信を区別する。制作秘話へ日付は補わない。
- 著者・監修・プロデュースのβ既存ID・版・根拠を照合し、原本は更新しない。汎用の「制作に関わった」関係を重複掲載しない。
- ID対応・11資料URL・商品草稿は [登録manifest](../research/pluto-beta-20261112/registration.json)。ASIN・版・画像を推測せず、既存確認済みのPLUTO商品も0件のため商品は未掲載。

## 経路と今回の補修

βに接続されたAppは収集5操作のみで、テーマauthoringは公開されていない。実運営アカウントの権限を既存 `dispatchThemeRegistration` で検査し、ローカルのサーバー呼出から既存テーマ受付とWeb importerへ配送した。通常の資料URL安全検査・原文抜粋照合・Gemini判定・公開世代反映を通しており、取得証明・受理IDの手入力やAI判定の迂回は行わない。HTTP/OAuth／実ChatGPT MCPの接続試験とは区別する。

旧虫ん坊ページはHTTPにcharsetがなくHTML内でShift_JISを宣言する。取得上限・匿名HTTPS・SSRF検査・fatal decodeを保ったまま、先頭1024 byte内のmeta宣言を読む補修を追加。HTTP宣言とUTF-8 BOMを優先し、不正byteやscript／範囲外の宣言を推測で受け入れない。実資料の正常取得・照合を確認した。

初回は新Entityのdescription制限・about指定漏れ・離れた抜粋の連結で差し戻された。入力を訂正して再送。舞台の日付は切り出しの終端が日付内部へ当たって「2015/」で途切れていたため、日程全文と会場を独立した抜粋へ修正して公開した。失敗受付を成功扱いにしない。

導入・短い見出し・章の問い・ノード説明は既存catalogueを使用し、PLUTO専用の画面分岐は追加しない。3つ目の問いに対応するN05はまだ未公開。新しい画像は作らない。制作秘話を一覧の先頭へ配置し、一般的な関係定義から読み始める構成を避けた。構成版3の表示も固定版として保持する。

ノードの説明は、ID・版が一致するテーマ用captionを、既存の汎用descriptionより先に使う共通処理へ修正した。既存description自体は書き換えず、テーマ用captionがない／版が異なる場合は既存の説明を表示する。

## 未反映・再開

G05（制作協力）とN05（原作の読み解き方）は一時エラーの再試行が項目単位の日次上限に達し、`2026-11-12 17:00 JST` 以降に通常キューで再試行する。無料API枠全体の消費とは別のローカル再試行制限。上限の変更・同じ内容の新ID再送による回避・課金はしない。

先行テーマ更新の受付は待機項目を含むため、確認済み19件を後続の明示構成へまとめた。先行更新が版競合になっても公開済み記録・原資料は消さない。未公開2件はWeb importerのreceiptを維持している。

再開時はこの2件の通常receiptを確認し、公開後の実ID・版を同じテーマへ追加する。現行構成を読み直し、presentationの構成版・N05の補足参照・制作会社captionを更新してβ確認する。残りはこの1バッチが目安で、採用・公開できるまでは全21件完了としない。

## 検証（初回登録時）

- `knowledge-source-verification` 23件、`theme-reading-refresh` 12件、`knowledge-entity-caption` 2件、計37件成功。caption修正後に関連14件を再実行し成功。
- 変更したコード・テスト4ファイルのeslint成功。
- Next型検査込みbuild成功。最終build `2NAbX7Dbm5DrL_ZkbEdNL` をローカル3200／HTTPS βへ配置。
- PC幅1500pxで年表7件、連載開始→制作秘話→原文引用→親の記録へ戻る操作、ノードのテーマ用説明を確認。Gemini等の管理者承認や手動受理への置換はしていない。
- 375×631pxで初期表示・年表7件・PLUTOのEntity詳細の説明・年表へ戻る操作を確認。documentElementのscrollWidthは365px、viewportは375pxで横溢れなし。年表自身に内容より小さい内部スクロール領域を作らない既存表示を維持。iPhone実機は未確認。
- 3200は初回読み込みに時間を要したが、その後同じ構成版4のタイトル・年表7件・関係図・制作秘話を確認。読み込み途中を成功扱いにしない。
- 専用 `/t/…` のローカルHTTP 200と、HTTPS βのDOMでテーマ名・leadのdescription・`noindex, nofollow, noarchive`・既存canonical形式を確認。βcanonicalは既存仕様どおり正式originを指すが、本番にテーマを登録したことは意味しない。
- 画面保存先：`C:/Users/nishr/.codex/tmp/plunode-pluto-beta-20261112/pc.jpg`、`mobile.jpg`。既存UIの全体デザイン受入・未公開2件・商品表示の確認とは区別する。
- 本番VPS・本番データ・既存会員／Capsule・既存KG原本は未変更。βの通常キュー・新規テーマと表示catalogueのみ追加。

## 確認URL

[βの現行構成版6を開く](https://graph-beta.isinxnisi.com/?ktheme=theme%3Adf8040bd38f635390870263b9f50b557e9be444f53695e06&krev=6)

## 商品の追加指定を反映（2026-11-12）

### 商品の同定と保存

ユーザー提供 `https://link.amazon/B0iJNnc7U` をWindowsから取得し、Amazon.co.jpのASIN `B002DE6U7I` へ200で遷移することを確認。正式商品名は「PLUTO (プルートウ) 全8巻完結セット (ビッグコミックス)」、商品説明にも「1~8巻セット」、出版社は小学館。価格・在庫・年・初版／限定版の属性は登録しない。ページの言語欄「英語」、長さ「1ページ」等は商品同定に利用できる内容と不整合で、信用して転記しない。言語は標準の未特定値undで保存し、共通カードではその値を表示しない小さな修正を行った。Amazonをweb search toolで開く試行は失敗したが、Windowsで取得した実ページの本文と遷移先は確認できた。

既存product_editorial_versionをPLUTO／プルート／ASINで照合して0件。新規商品 `book:pluto-complete-8-b002de6u7i` の1版を、既存の運営権限・active判定付きdispatcherから登録。表示名「PLUTO 全8巻セット」、紹介文「『PLUTO』を第1巻から最終巻まで、まとめて読む。」、購入先とボタンは本人指定を使用。画像IDは未設定。添付の「レトロヒーロー再構築の漫画工房.png」は商品版・商品画像へ一切紐づけない。Creators APIは未設定のまま、登録済み案内先を維持する。

商品は漫画PLUTO EntityだけをappliesToへ指定。同一テーマのproductPinsへ追加した通常の更新受付がpublishedとなり、構成版4→5、readingBaseRevision=4を確認。19記録・9 Entity・12資料の配列は更新前後で完全一致。過去の構成版4と商品未掲載の状態も保持する。今回もHTTP/OAuthや実ChatGPT MCPからの配送試験とは区別し、ローカルの認証済みサーバー呼出を利用した。

### 表示・検証

- 商品カード4件・provider統合1件の計5テスト、変更したcomponent／testのeslint、型検査込みNext build成功。最終build `bh5OFa1t0enGDJHs8Vg_M` をローカル3200／HTTPS βへ配置。本番未変更。
- 公開の商品取得APIで、テーマ5版内の漫画Entityには1件、原典・舞台・アニメの各Entityには0件を確認。商品画像なし、購入先は本人指定のURL。
- HTTPS βのテーマ概要と漫画Entity詳細の双方で商品表示を確認。原文説明・年表7件・読み物を保持し、画像は準備中と表示。未確認言語のUNDや英語版／日本語版は出さない。
- PCと375×631pxのカード・正式名の開閉・購入hrefを確認。スマホcard幅290px、documentElement幅365px／viewport375pxで横溢れなし。画像DOMなし。ローカル3200でも同じ商品名・紹介文・購入hrefを実画面で確認。購入処理は行っていない。iPhone実機は未確認。
- 保存画面：`C:/Users/nishr/.codex/tmp/plunode-pluto-products-20261112/pc.jpg`（ローカル）、`mobile.jpg`（HTTPS β）。

### 依頼全体の残り

商品追加は完了。G05・N05の元受付を再確認し、両方とも項目別の再試行上限によるquota、次回 `2026-11-13T08:00:00Z`（11月13日17時JST）を返した。全体は19/21公開のまま。以前のT06失敗受付と、日程全文を訂正後に公開済みのT06は区別する。WSLの外向きTCP timeoutも今回の確認時点で継続しており、外部AI処理の正常化とは報告しない。枠回避の新ID再送や手動受理・課金は行わない。

## 利用者提供の挿絵と商品表紙を追加（2026-11-12）

①素材の識別、②既存登録・テーマへの接続、③25テスト／lint／build／実画面確認まで完了。今回の画像対応は3工程完了。ZIP全体の19/21件・未公開G05／N05は変わらない。本番は未変更。

### 素材の分離と軽量化

- テーマ挿絵は利用者指定の「レトロヒーロー再構築の漫画工房.png」。1672×941 PNG／3,224,150 bytes → 1600×900 JPEG／566,699 bytes。縦横比を保った長辺1600px・quality90・4:4:4で保存し、切抜き・文字や注釈の追加・拡大はしない。`public/theme-assets/pluto-editorial-v1.jpg`。画像が既存の導入・紹介・OGに使われる共通presentationへ登録した。テーマ6のreadingBaseRevision=4を通し、4以降の同じ導入でも利用する。
- 商品表紙は今回別途提供されたJPEG。745×1000／225,031 bytes → WebP745×1000／182,976 bytes、小表示477×640／84,704 bytes。既存の運営権限検査付き画像登録dispatcherから検査・保存し、画像ID `71b03ee251c09b986c4400388c29bc23b5a2eca20c705fb142ec49c0cd0a20da` を返した。role=product-photo、credit=利用者提供の表紙画像。今回の提供を越えた権利者・外部出典・全8冊の集合写真という説明は補わない。
- 同じ商品IDの2版へ表紙を追加し、通常のテーマ更新受付publishedを確認して構成版6へ接続した。商品1版とテーマ5版は画像なしの固定版として保持。購入URL・正式名・漫画Entityへの紐づけは保持。テーマ挿絵を商品へ流用しない。
- 挿絵の共通schemaは、利用者提供のイラストに存在しない出典URL・利用条件URLを必須にしないよう補修。写真には両URLを引き続き要求し、入力された不正URLも拒否する。製作者を推測してAI生成とは表記しない。

### 配置・確認結果と制約

- 関連25テスト、変更したTS/TSXのeslint、型検査込みNext build成功。build `lNE9NWMjOVCeYB9Q43Mn8` をローカル3200／HTTPS βへ配置。
- 3200のPC画面とHTTPS βのPC／375×631pxで、テーマ導入の横長挿絵と商品カードの縦長表紙が別々に表示されることを確認。商品画像は96×96pxの枠内でobject-fit:contain、自然サイズ477×640の読込完了。カード幅290px、documentElement幅365px／viewport375pxで横溢れなし。正式名の開閉と購入先hrefも確認し、購入操作は行わない。
- 旧テーマ5の商品画像nullと新テーマ6の画像ID・同じ購入URLをAPIで確認。専用テーマページ・挿絵・OGのHTTP200、OGのimage/png・333,308bytesとβのnoindexを確認。既存SEO経路を維持。
- 変更前画面は `C:/Users/nishr/.codex/tmp/plunode-pluto-products-20261112/`、変更後は `C:/Users/nishr/.codex/tmp/plunode-pluto-images-20261112/` の `pc.jpg`、`mobile.jpg`、`theme-mobile.jpg`、`local-pc.jpg`。
- 実ChatGPT App/MCP・HTTP/OAuthによる画像アップロード試験とは区別し、今回は既存の認証・運営判定付きサーバーdispatcherを使用。iPhone実機は未確認。HTTPS βの初回遷移はtimeoutだったが、ローカル確認後の再遷移で両画像の実表示を確認。WSL外向きTCPの既知障害は本件で修復・再調査していない。
