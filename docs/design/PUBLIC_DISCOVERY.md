# M2 日英検索・共有から探索へ

2026-10-15。[Issue #2](https://github.com/isinxnisi/graph-knowledge/issues/2)・[ROADMAP](../../ROADMAP.md)の実装契約。M1支援導線と既存Graph／会員データを保持する。

## URL・表示言語

日本語は既存 `/`・`/explore/{UUID}` を保持し、英語は `/en`・`/en/explore/{UUID}`。支援・プライバシーにも `/en/support`・`/en/privacy` を用意する。成立した公開URLのみ相互hreflang・自己canonicalを生成し、会員・共有・APIの英語別URLは追加しない。

公開URLの言語をproxyが検証・上書きした内部headerでroot layoutへ渡し、SSRのhtml lang・UI初期値・title・description・主要本文を一致させる。ブラウザの旧言語設定で英語文書が日本語へ変わることを防ぎ、明示した言語は既存のブラウザ設定にも保存する。会員・限定共有は従来のブラウザ言語を引き継ぐ。

設定メニューの言語変更は、探索URLを確定してから同じ起点・状態queryの対応言語URLへ移動する。英語探索の自動URL更新・コピー・再読み込み・支援／会員からの復帰でも `/en` を維持する。既存URL codec・状態データ形式は変更しない。英語prefixも8000文字のURL上限へ含める。

## 人が読める公開本文

公開探索ワークスペースの下、共通フッターの前に簡潔な概要を置く。Graphの高さと操作配置は維持し、JSなしの初期HTMLからもサービス紹介・実在する探索入口・代表対象の関係・出典を読める。検索エンジン専用の隠し本文は作らない。

公開Entityとpublished Claimの近傍を使い、最大12記録のうち6記録を一例として表示。既存の同一SPO表示束と肯否・Role表現を再利用する。資料はSource IDで重複排除する。全関係の網羅や独立根拠数を意味しない。Claimのrevisionを揃え、非公開データ・Capsule・保存Graph・cursorを本文やOG画像へ使わない。

英語の紹介・説明・関係語・種別は英語で表示する。知識データには言語別名称の契約がないため、登録名称・別名・説明・資料名の原文を保持し、英語名や翻訳したプロフィールを推測しない。未登録の対象は404。公開関係のない実在する登録対象は旧URLで閲覧・探索を続けられるが、index対象から外す。DB障害をNotFoundとして成功扱いにしない。

## 共有画像・ブランドアイコン

添付された青いノードのP型ネットワークをSVGで再構成する。別のブランドへ置換しない。SVG・16/32/48px ICO・180px Apple touch iconを同一originへ配置する。操作用の既存UIアイコンは変更しない。

トップと公開Entityごとに1200×630のImageResponseを生成。対象名・種別・Plunodeを、中央の540px幅へ配置して正方形cropにも重要文字が収まるようにする。長い名称は画像だけ省略し、metaと本文には全名を残す。元の日本語名称はローカルOFLフォントで描画し、画像生成のための外部フォントAPIを呼ばない。

画像URLは対象IDと日英pathだけ。状態queryや非公開内容を含めない。画像200／PNG寸法・SNSクローラー向けHTMLの整合・中心cropを確認する。SNS独自のキャッシュ・実際の掲載・検索順位は自サイトの検証と別で、各社の表示を一律保証しない。

## 公開境界・運用

正式host・公開フラグ・public-kgの既存条件を維持。状態付き探索はnoindexとし、canonicalは状態なしへ向ける。previewはnoindex／robots全拒否。member・shared・api・integrationsは従来どおり検索対象外、広告originのアプリ404を維持する。sitemapは成立した日英公開URLだけを列挙し、状態queryを生成しない。

Search Consoleのサイトマップは本人が提出済み。同じ `/sitemap.xml` が英語URLを含むため、新しい所有権設定は不要。反映後、URL検査へ `/en` と代表Entityを入力し、ライブテスト→必要に応じインデックス登録をリクエストする。Bingの本人アカウントがあればSearch Consoleからインポート可能だが、未実施を登録済みとしない。

本番は既存のsudo境界でWebだけ更新する。KG backup／readiness／失敗時の旧Web復帰は既存scriptを使い、DB・PG・Caddy・認証は変更しない。配布・検証結果はPUBLIC_BETA_PROGRESS末尾へ記録する。

## 今回の検証と配布

- 関連unit 27件、変更範囲ESLint・TypeScript・host／standalone image buildを検証。
- 日英8ページのSSR／meta・公開境界、JSなしの英語入口→PLUTO→関連対象・出典、画像とfavicon、PC1440／390／320pxの探索・支援・会員往復・再読み込み・日本語切替を確認。
- M1の日英PC／390／320px導線6件、既存会員往復3件、広告・GA4・共通設定の代表経路を回帰確認。会員更新・広告creative・GA tagは既存fixture検証であり、新たな実Google認証・決済・実広告配信の確認とは区別する。
- [共有画像の中央cropと小サイズアイコン](../assets/public-discovery/share-and-icons.png)を実ブラウザで確認。

本番の適用手順（2026-10-15適用・代表検証済み）：

```bash
sudo bash /home/develop/graph-m2-discovery-20261015/scripts/activate-m2-discovery.sh
```

M1を含むmainのWebのみ更新し、旧Web復帰を備えたreadiness確認後、正式HTTPSで英語SSR・支援先・PNG寸法・faviconを検証する。事後HTTPSだけ失敗した場合は更新済みであることを明示する。実装・転送だけでは本番適用済みとして扱わない。

反映後のSearch Console：`https://plunode.net/en` と代表の `/en/explore/2b7c6289-d050-4dc0-93e3-9307681253cc` をURL検査→公開URLをテスト→必要ならインデックス登録をリクエスト。SNS側に旧画像が残る場合は各社の再取得・キャッシュ更新を別途確認する。

## 正式反映の確認

本人の適用ログでM2のWeb healthy・正式HTTPS成功を確認。Codexも正式サイトでJSなしの英語入口、画像／クローラーmeta、PC1440・390・320pxの探索／支援／会員往復とURL復元の5件が成功（35.5秒）。本人の実画面・Search Console／SNS側確認は並行中。
