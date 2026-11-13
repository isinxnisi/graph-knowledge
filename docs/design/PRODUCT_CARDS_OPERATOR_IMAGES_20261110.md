2026-11-14 表示範囲の明確化：`productPins` はテーマ詳細で紹介する商品の版指定だけに使う。Graph・年表下部と要素詳細は、テーマ内のEntity／Recordに `appliesTo` で明示された登録済み商品の最新版を読み、`productPins` の有無や内容では絞らない。テーマ外・異なる種類の同名IDは混ぜない。テーマの紹介商品は固定版を維持する。以下の既存手順の「表示を外す」はテーマ詳細の紹介商品に限る。

# 商品カード・運営画像 API（2026-11-10）

## 到達範囲

ローカル3200とHTTPS βで、運営の画像ファイル登録→軽量化→画像ID→商品版→テーマ版→通常の詳細欄まで接続する。本番公開・外部契約・Creators APIの有効化・一般ユーザーの画像投稿画面は今回の対象外。

共通カードは「関連アイテム」。書籍、カレンダー、映像、音楽、その他を扱う。テーマ、Entity、Record詳細で既存の `ThemeProducts` を共有し、商品ごとの `appliesTo` で関連を指定する。商品を追加しないテーマも作成・更新できる。

## 表示

- 上段は画像と商品名・短い紹介。下段に幅いっぱいの購入ボタン。
- 画像枠は1:1、通常136px、狭い欄は128px。欄が290px以下なら画像152pxと本文を縦に並べる。元画像は `contain` で全体を表示し、切り抜き・引き伸ばしをしない。縦長画像のintrinsic sizeが枠を拡張しないよう枠内で絶対配置する。
- 商品名は日英の短い表示名を優先し、正式な商品名は開いて読める。種別・年・言語だけを小さな属性として表示する。著者・出版社等を一律に羅列しない。
- 見出し横に「Amazonアフィリエイト」、販売リンクがある欄の末尾に参加者表示を一度出す。各カードに注意帯を重ねない。
- 紹介イラストは画像外に「紹介用イメージ」。APIの画像と運営画像を同じ部品へ渡すが、保存・権利の扱いは分ける。
- 画像がない／失敗したときは小さな補助表示に切り替える。紹介文と登録済みの購入先はそのまま使える。
- 価格・在庫を表示しない。`ready` は確認済みの案内先を表し、在庫保証ではない。
- 未対応地域は、A「紹介を残し、別地域を明示して選ぶ」とB「その地域で購入できる商品だけ」を運営限定の比較画面で切替できる。βの暫定表示はAで、正式採用の判断とは分ける。通常カードに試作操作やAPIの内部エラーを出さない。

## 運営登録 API

### 認証と経路

`POST /api/site-operations/products` は既存の会員セッション・active判定・サイト運営権限・同一Originを必須にする。一般ユーザーからの投入はできない。既存App/MCPは `themes:compose` に限定し、HTTPと同じサービス・版照合・再送契約を使う。collection専用接続の権限は増やさない。

秘密値、Cookie、アクセストークンを会話へ貼る必要はない。HTTPは既存の認証済み運営クライアントから利用する。下のJSONは内容の例であり、実際の接続設定や認証情報を含まない。

### 1. 画像を受け取る

HTTPは `multipart/form-data` の `image`（ファイル）と `metadata`（次のJSON）を受け取る。JSON/base64も可能。寸法、形式、容量はファイルから自動検査する。

```json
{
  "requestId": "新しいUUIDv4",
  "provenance": {
    "id": "plunode:product-art:v1",
    "kind": "generated",
    "credit": "Plunode",
    "terms": "この運営素材について確認した利用条件"
  },
  "role": "illustration",
  "alt": {"ja": "カレンダーの紹介用イメージ", "en": "Illustrative image for the calendar"}
}
```

`kind` はoriginal／generated／licensed。自作・生成素材へ架空の外部URLを求めない。licensed等で必要な出典は任意の `sourceUrl`、クレジット、利用条件へ記録する。同じ由来は次回から `provenanceId` 一つで再利用できる。プロフィールは不変で、条件を変える場合は新IDを使う。

`role` はillustration／product-photo。添付カレンダー素材はillustration。アップロードの結果は `imageId`, `url`, 処理後の寸法・容量、入力寸法・容量・形式を返す。

MCP `upload_product_image` は同じmetadata＋base64。MCP全体2.1MBの受信上限を共有するため、約1.5MBを超えるバイナリはHTTPファイル経路を利用する。上限を広げて全MCP操作のメモリ負担を増やさない。

### 2. 商品版を作る

HTTP `action: "save-product"`／MCP `save_product`。

```json
{
  "requestId": "新しいUUIDv4",
  "expectedRevision": 0,
  "product": {
    "id": "calendar:任意の一意ID",
    "title": "正式な商品名",
    "displayName": {"ja": "短い日本語商品名", "en": "Short English product name"},
    "category": "calendar",
    "year": 2027,
    "language": "en",
    "metadataSource": "https://www.amazon.co.jp/dp/B0GMV4CK32",
    "imageId": "画像登録で返ったID"
  },
  "reason": {"ja": "短い魅力の紹介", "en": "A short introduction"},
  "offers": [{
    "productId": "calendar:任意の一意ID",
    "marketplace": "JP",
    "asin": "B0GMV4CK32",
    "affiliateUrl": "https://link.amazon/B0cLIilgt",
    "status": "ready",
    "checkedAt": "2026-11-10T00:00:00Z"
  }],
  "appliesTo": []
}
```

新規はexpectedRevision=0、変更は `read_product` で取得した版を指定する。画像・商品情報・案内先をそれぞれ独立して持つ。画像なし・販売先なしでも保存できる。既存のworkId・著者・版は任意で、同じ情報を重複入力させない。Entity／Recordにも紹介するときだけ `appliesTo: [{kind:"entity"または"record",id:"既存ID"}]` を指定する。

### 3. テーマに紐づける

既存 `submit_theme` の `productPins`、または `update_theme` の `changes.productPins` に、返された `{id,revision}` を入れる。テーマをGit内のJSONで編集する必要はない。未指定は既存の紐づけを保ち、`[]` を指定した新しい版では表示を外せる。テーマ更新の通常のstatus確認を用い、完了後に通常のテーマ詳細を開く。

画像差し替えも、画像追加→商品新revision→テーマ更新の同じ流れ。元の商品・テーマ版は変えない。商品だけの変更では読書用の導入・SEO・解説を参照する `readingBaseRevision` を保持する。内容の違うテーマへ別の解説を使い回すものではなく、本文・記録・資料等が変わったときには解除する。

## 検査・保存・自動整理

- 入力8MiB、24メガピクセル、最小辺32px。静止JPEG／PNG／WebP／AVIFのみ。SVG・アニメーション・破損データを拒否。
- 自動回転、sRGB、メタデータを除去。縦横比を保ち、長辺1600pxまで、拡大なし。WebP品質88／alpha100。表示用640px派生も生成。
- 処理後本体3MB・派生1.5MBまで。失敗時は保存前に中断し、一時ファイルや大きな入力原本を残さない。小さな素材では再圧縮後が原本より若干大きくなることはある。
- 会員DBの039で追加したbyteaへ保存し、元ファイルの寸法・容量・形式だけを記録。標準backupに含める。最大2GBの運営画像保存目安・運営者あたり500登録／日。
- 画像IDは内容・由来・用途を含む不変ID。商品版は追記のみ。過去版とCapsuleの固定ピンを壊さない。
- 既存確認Workerで1日1回・最大100件、7日の猶予を越えた一度も商品版に参照されていない素材だけを整理する。商品版に参照された画像は過去版も含めて保持する。登録・紐づけと同じDBロックを使い、途中で削除しない。
- Amazon配信画像は期限付きのリモート画像。自前アップロード・再圧縮・保存へ流さない。Creators未設定／設定不備／通信失敗と商品不存在を分け、運営の有効な案内先を残す。
- URLは認証情報を返さない。画像応答はWebP、nosniff、固定IDのimmutable cache。未紐づけの画像は公開画像APIで読めない。監査ownerは非公開。

## 確認先・再開

通常表示：`https://graph-beta.isinxnisi.com/t/reading-20261110%3Awebb%3Atheme` → このテーマについて。

比較：`https://graph-beta.isinxnisi.com/operations/product-preview`（運営ログイン必須、noindex）。試験素材・画像失敗・地域A/Bはここへ分離する。

通常の起動は既存 `scripts/start-local-previews.py beta --node <Node24の実行ファイル>`。DB・コンテナの初期化はしない。039は明示の `scripts/member-migrate.ts --product-assets --confirm-origin <βorigin>` で適用し、HTTPリクエスト時にはmigrationしない。Workerは同じソースで再起動する。

実測と接続済み／未確認の区別は [検証記録](../verification/PRODUCT_CARDS_OPERATOR_IMAGES_20261110.md) を参照。
