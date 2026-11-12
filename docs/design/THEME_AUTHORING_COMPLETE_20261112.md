# ChatGPTからのテーマ一式登録・更新（2026-11-12）

## 今回の合意と完成条件

PLUTO専用の投入scriptではなく、運営者がChatGPTで準備した任意のテーマを登録・更新する経路を完成対象とする。ローカル3200／HTTPS βまで。本番の更新・外部サービスの追加登録・課金は行わない。

工程は①保存契約、②HTTP／MCPと閲覧への接続・β確認、③実際のChatGPTで添付→登録→同一テーマ更新。②の内部MCP transport試験を③と呼ばない。ネットワーク・本人認証等で③が未了なら、そのまま未了として記録する。

| 内容 | 登録／更新経路 | 保存と表示 |
| --- | --- | --- |
| 根拠URL、出典、引用、知識、Entity、時期 | 既存submit_theme／update_themeのpackage | 共通の原資料・内容・重複確認を維持 |
| テーマ名・説明・構成・年表 | 既存の同一Theme idへの更新 | exact revision競合検知、旧版保持 |
| 導入の問い・短い紹介 | presentation[].hook／lead | Theme原本版のreadingへ保存、日英を分離 |
| 短い見出し、年表要約、説明との紐付け | presentation[].records | 公開済みの収録Record版／そのRecordに紐づくnote版を指定 |
| Entityの短い説明 | presentation[].entityNotes | 対象Entity版と、そのEntityへ接続する収録Recordを根拠として指定 |
| テーマ挿絵 | upload_editorial_image → presentation[].imageId | Git外の不変画像ID、閲覧／SEO画像で共用 |
| 商品・紹介文・購入先 | search_products／read_product → save_product → productPins | 商品版・販売先・画像を分離、同じ商品を再利用 |
| 商品画像 | upload_editorial_image → save_product.product.imageId | product-photoとillustrationを区別、正方形の表示枠は既存UIを継続 |
| 原文に対する訳文 | 既存read／submit_theme_translation | 原文／訳文／Theme版を混同せず、既存の同等性確認を継続 |

## 画像の受け渡し

ChatGPTの添付は公式file input契約を使う。tool名はupload_editorial_image、`_meta.openai/fileParams=["file"]`。fileはdownload_url、file_idを必須、mime_type、file_nameを任意として四つともschemaに宣言する。利用者にローカルパスやBase64作成を要求しない。

公式参照：<https://developers.openai.com/plugins/reference> のFile APIs／Define file inputs。

用途はtheme-illustration／product-illustration／product-photo。運営用HTTPの既存multipartアップロードも維持する。Creators APIは任意であり、Amazonの外部画像は無条件に自前保存しない。

ファイルは信頼するChatGPT添付用HTTPSホストに限定し、公開DNS回答を検査して接続先を固定する。redirectは追わず、認証情報付きURL・private IP・圧縮応答を拒否する。取得上限8 MiB・20秒。短命な署名付きdownload URLやfile_idをDB／ログへ保存しない。実際の添付転送でoaisdmntprkoreacentral.blob.core.windows.netを観測し、この正確なホストを共通の許可判定へ追加した。任意のAzureホストを許可しない。ホスト側の配信先が増える場合は、観測と検査を経て追加する。

magic bytes・画素数・形式を検査し、長辺1600、thumbnail長辺640まで縦横比を保持して軽量化する。元ファイルは恒久保存せず、一時ファイルも作らない。寸法・元容量・処理後容量を応答する。

素材の由来・利用条件は再利用できるprovenanceIdへ保存する。`creditDisplay:internal`は内部の受け取りメモ、publicは必要な公開クレジット。素材の由来の文章と、紹介用イメージであることの固定表示を混ぜない。後から画像を足す／差し替える場合も新しいID／商品版／Theme版を使う。

## 更新・不変版・保管

presentationは言語別の完全な選択。省略は継続、[]は新しい版から外す。ほかの言語を残す更新では、その言語もread_themeで読んだ内容を引き継ぐ。既存Gitカタログは過去版の互換用として残すが、今後のAPI入力にGit編集やテーマごとの再buildを要求しない。

明示したpresentationの参照先は同じTheme snapshot内に限定する。新しいpackage項目はitem:KEYを受理後の実ID／実revisionへ解決する。新規の未審査事実を説明文へ隠して公開する経路にはしない。

記録の除外／版の選び直しだけを指示した場合は、引き継いだ見出し等の古い参照を新しいsnapshotと照合し、外れた分だけ除く。紹介文・挿絵・無関係な見出しを消さず、利用者へ余分な編集を強要しない。明示した新しい参照の誤りはエラーにする。

会員migration040は受付と画像の参照を記録する。処理中は画像を予約し、公開した画像は過去版も含めGCから保護する。公開後の受付削除で参照が消えるCASCADEは使わない。未接続画像だけ7日の猶予後に既存の自動GCで整理する。一般利用者の画像投稿UIは追加しない。

## 接続・受入の区別

運営のsystem intake／内部監査を維持し、公開の投稿者badge・個人活動・会員通知は追加しない。収集専用tokenを勝手にcompose権限へ昇格しない。ChatGPT側が古いscopeを保持する場合は既存Appの更新・本人OAuth同意で接続を整える。

既存beta Appはcollection用の5操作で、実確認時の再接続もmissions:collectのみを要求していた。現在の23操作のcompose handler確認、認証付きHTTP、実ChatGPTの取得ツール一覧は別の確認対象である。正式Appへβの試験データを送ったり、本番配置を更新したりして代用しない。

## 既存Appの更新とβ通信の復旧

既存の「Plunode資料収集 API（β）」のApp ID／接続先を維持して「ツールを更新」を行う。旧tokenも認証済み運営者であることを確認した上で新操作の定義を取得できるが、実行はthemes:composeを必須とする。各操作にOAuth scopeのmetadataを付け、未同意の実行にはmcp/www_authenticateのinsufficient_scopeを返す。既存の収集専用tokenを無断で昇格しない。

このPCではWSLの外向きTCPが失敗し、同じURLはWindowsで取得できる。開発βだけの明示opt-inとして、Windows標準curlのHTTPS通信を利用する。許可先・公開IPv4の固定・通常のTLS検証・redirect禁止・容量／時間上限を維持し、署名付きURLはstdinだけに渡す。トークン検証で参照する公開鍵は同じβ Webの固定loopback URLから取得し、issuer／audience／署名／expiry／scope／DPoPの検査を維持する。新しい待受port・常駐proxy・全体のDNS変更は追加しない。本番runtimeでは有効化できない。private設定は~/.local/state/plunode-previews/beta-windows-https.json、owner本人／0600／{"enabled":true}に限定する。WSL通信復旧後はこのopt-inを外して通常経路に戻せる。

進捗・実測・残件は[検証記録](../verification/THEME_AUTHORING_COMPLETE_20261112.md)を参照。
