# Capsuleの同一URL更新・OGP・関係先選択（Issue #63）

2026-10-30。ユーザーの今回の三点を現行契約として実装する。本番VPSは対象外。ユーザーの既存UX評価と、今回のAIによる検証を区別する。

## 設計と実装

- 通常保存から独立した「保存した変更を共有へ反映」。link IDとbearerを維持し、公開snapshotだけを追加する。再発行は内容を変えずURLを置換、停止は公開読取を閉じる。
- コメントは同じリンクで公開された版を横断し、投稿時のrevisionを保持。「投稿時の図」から文脈を読める。コミュニティ固定掲載と未共有版を公開履歴へ混ぜない。
- サーバーが読める`/shared/<token>`に個別metadata。1200×630画像は公開snapshotのタイトル・説明・実際の接続から最大7対象を描画する。保存・共有transaction中は生成せず画像要求時に生成する。
- 関係先は名前・分類・関係／役割を絞り込み、条件を横断して選択・一括追加できる。部分取得を明示し、条件外の選択を保持・表示する。
- 実操作で発見した、一括追加Undo後の消えた対象の選択表示も修正。

## 開始時点と配置前の記録

既存起点はmain `0a2b49a6`、配置は`fb8e8f49` / `1rJbvsAmvjfO_C37LdPZs`。未コミット`memo.txt`は保護。未受入候補の取込みなし。

独立3210プレビューで実public-kgの長崎尚志→Capsule→PLUTOの関係先から、手塚眞を選択→浦沢で絞り込み→浦沢直樹も選択→条件外の選択を表示→2件一括追加（5対象8Claimから7対象12Claim）→1回のUndoで戻る操作を確認。

実DBの32 tableをread-only snapshotから別DBへ復元し、000〜014 checksumと旧列・旧行を照合。015追加と再実行は復元先で成功。その後、以下の配置工程でliveへ適用した。

最終の配置・操作結果は以下。


## 配置前の確認

- TypeScript、変更箇所ESLint、diff-check成功。
- UI・文書・履歴・共有・認証・コミュニティ・運営・Graph motionの12 suite、146テスト成功（並列build等と重なった初回は3件が時間制限／待機不足で失敗。専用プレビュー停止後に該当3 suiteの59件を単独再実行して成功）。
- 隔離PostgreSQL＋OIDC fixture: Capsule文書15件、会員・cold start36件成功。固定の55432／3222を使う既存確認環境を停止せず、外部公開ポートのない専用コンテナnetwork内で検証。
- OGPは実ImageResponseから1200×630 PNGを生成し、日本語タイトル・説明・関係図を目視。外部SNS表示は別途確認する。
- SQL認可の同一境界で、別dataset、owner停止、版停止、共有停止、私有版、cohortコミュニティだけの版を遮断。共有反映の重複実行、token再取得不変、コメント旧版／新版継続、固定掲載の不変を実DBで検証。


## 既存3200／HTTPS βへの最終配置

- 配置commit: `5dc34e31e2a4e370facd49cd09990bde3024ae24`。build: `1eOVcSb5AZmVQ3nOgAC5l`。Node v24.21.0。Webは既存のNode launcherで起動し、新規Web Docker imageは使っていない。
- `http://localhost:3200/` と `https://graph-beta.isinxnisi.com/` の両方でbuild一致・public-kg revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb` 不変を確認。
- 既存のGoogle認証／private runtime 21設定、launcher、12稼働Docker service、保全時点のAIラボartifact 40ファイルを保持。KG、Worker、Kev、管理Connector、教育・予定は変更していない。
- 最初の機能配置は `5e37b004` / `ViI8V1ihS7aBtvcp5aVdu`、実画面のフィルター幅修正は `9ca2c8d5` / `DPz6BclE1bDibsinkv4eh`。最終はOGPの複数中心の線の見え方と長い名称の折返しを修正した上記SHA。後の二回はWebだけを切替え、migrationを重ねていない。
- 変更は日本語メッセージでcommitし、設定済みorigin/mainへ通常push成功。末尾の検証記録・画像の追加commitは文書のみのため、再build対象ではない。
- Autopilotはtoken付きholdを保持して変更・検証・commit・反映を実施。無関係な候補の受入・失敗の一括acknowledgeなし。既存`memo.txt`は未変更で残す。作業終了時は保持terminalのEnterで解放する。
- **本番VPSは更新していない。**

## 実DBと復旧検証

015適用前に既存Webだけを正常終了し、書込が止まった会員DBの新しいbackupを作成。32テーブルのschema・旧列／旧行・000〜014 checksumを、別の隔離PostgreSQLへ復元した値と照合した。復元先とbeta liveへ、既存private設定・`MEMBER_ORIGIN=https://graph-beta.isinxnisi.com`・明示`--capsule-publications`で015を適用し、再実行の無変更を確認。ledgerは000〜015の16件。会員・独立コミュニティ・既存Capsuleを削除せず、live DBのrestore/resetは行っていない。

- 015 checksum: `141487386927427572b8e18bfc96184e83110741c3524f1a896e3d0d38397baf`
- backup SHA256: `d58f98981c97adf06781bd77fc9afb544a5b26a43637f2a86f26994fd5c44dba`
- 復元PG image: `sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537`
- 検証Node image: `sha256:470015c1ab1577c19efce2e80cdad4afd9c682cf8f4dcf3dccae5abfd9113397`

秘密を含まない識別情報と旧migration checksumは[release.json](../research/capsule-sharing-20261030/release.json)。DB dumpと復旧資材・個別ログはignoredの`backups/capsule-20261030/`に保持し、公開リポジトリへ含めない。

## 実ブラウザの連続操作

HTTPS βの既存Googleログイン済み本人セッションを使用。Googleへの新規ログイン／再認証操作を行ったという意味ではない。

1. PLUTOの通常Graphから新規Capsuleを作成し、タイトル・説明を入力して会員保存。確認用「β確認｜PLUTOのつながり」を保存版1としてリンク発行し、コメント受付ONを確認。
2. 別タブで保存版1を開いてコメント。所有者側でタイトルを「β確認｜PLUTOから広がる作者たち」に変更して保存版2を保存。この時点では共有readerとHTTP metadataが版1のタイトル・画像を保持し、未共有タイトルがHTMLに出ないことを確認。
3. 「保存した変更を共有へ反映」で、同じURLのまま版2へ更新。既存readerは版1の図・視点・入力を保ち、新版通知だけを表示。コメント入力中は版切替を保留し、公開更新後でも保存版1のコメントとして投稿できた。
4. 「更新された図を読む」後に版2へ投稿。版1の2投稿と版2の1投稿が同じ会話に並び、それぞれ「投稿時の図」の版別リンクを保持した。
5. My Capsulesから同じ作業空間へ再訪。長崎尚志の関係先でBILLY BATを選択→名前master＋関係「脚本」で絞る→MASTERキートンも選択。条件外1件を含む2件が選択チップに残り、一括追加で4対象6Claim→6対象10Claim。一回のUndoで元の件数へ戻り、消えた対象の選択表示も消える。Redo・保存版3の会員保存・スマホ幅から同じURLへの共有反映まで確認。最終ビルドで確認用の図を全体表示した視点で保存版4を保存し、同じURLへ明示反映した。
6. 最終フィルター配置で、390×844幅でも「著者」の条件を読め、条件外1件を含む2件の選択→条件解除→一括追加→Undo→新規草稿の破棄が成立。文書横幅380pxで横溢れなし。PC幅1280×720も確認。実iPhoneのタッチ・IME検証とは区別する。
7. 通常GraphでPrinceton Universityを検索し、関係先18件を取得。名前Johnで2件へ絞り、両方の追加済み表示を確認。10ページを超す続き／途中失敗／複数分類はfixtureの機能テストで検証し、実KGの巨大近傍全ケースを試したとはしない。
8. 別の確認用「β確認｜共有停止テスト」のリンクを発行・停止。開いていたreaderの再確認で図と会話が消え、HTMLにそのCapsuleのタイトルが出ず、画像URLが404となることを確認。この確認用Capsuleだけを未共有で残した。
9. 最終のlocalhost:3200でも匿名ブラウザから共有版4と過去3コメントを閲覧でき、投稿フォームは出さずログイン導線になることを確認。Google認証確認のためにlocalhostのCookie・originを変更していない。

コミュニティ固定掲載の版不変、非参加者・別範囲・私有版・停止版の負例は実PostgreSQL＋OIDC fixtureで確認。実ユーザーのコミュニティ掲載や既存会話を今回のテストで書き換えてはいない。

## OGPの確認範囲

- HTTPSのサーバーHTMLはCapsule固有の`og:title`・説明・`og:image`・Twitter large imageを返す。版1→2→3の公開更新でmetadataの画像revisionが変わり、通常保存だけでは変わらない。
- HTTPSから公開済み版1・2・3の1200×630 PNGを取得。実画像を見て、中央の無関係なノードの裏を線が通る問題を修正。単一中心の図は中心を保ち、複数中心の図は円周配置にして接続の誤読を減らした。長い名称の一文字だけの折返しも調整した。作者の保存配置は変更しない。
- 最終OGPテスト2件とESLint成功、最終public-kg buildのTypeScript／静的生成成功。追加したテストは、複数中心の図で第三の対象を線が横切る配置を検出する。
- Twitterbot／LinkedInBotのUser-Agentを使ったHTTPS画像取得は200。ただし、これは実SNS crawlerによる取得の証明ではない。
- LinkedIn Post Inspectorに、この作業で作った公開確認用リンクを入力してInspectしたところ、サインイン画面になった。登録・新たな連携は行わず、**SNS上のカード表示は未確認**。X／LINE等への実投稿も行っていない。
- Python-urllib User-AgentのHTTPS画像取得は既存Cloudflareで403 / error 1010。通常curl・ブラウザ・上記UAでは200。認証やCloudflareの保護設定は変更していない。外部サービスごとの取得可否は、実際に使うSNSのプレビューで追加確認が必要。
- SNSが既に取得したカードの更新時刻や停止後のキャッシュ回収はサイトから保証できない。旧`/shared#token`はfragmentのため個別OGPを返せず、共有画面から`/shared/token`をコピーして使う。

## 画像と短い確認手順

- [最終の共有画面と会話](../research/capsule-sharing-20261030/shared-final.png)
- [公開内容から作ったOGP](../research/capsule-sharing-20261030/ogp-published.png)
- [PCの条件横断選択](../research/capsule-sharing-20261030/neighbors-desktop.png)
- [スマホ幅の条件横断選択](../research/capsule-sharing-20261030/neighbors-mobile.png)
- [スマホ幅の共有反映](../research/capsule-sharing-20261030/publish-mobile.png)
- [閲覧途中の旧版と入力を保持](../research/capsule-sharing-20261030/reader-retains-revision.png)

1. HTTPS βでMy Capsulesを開き、Capsuleの「共有」でリンクを控える。
2. 編集・保存後に「共有」→「保存した変更を共有へ反映」。控えたURLを開き直す。既に開いたタブは通知から切り替える。
3. 図のEntityを選択→右クリック／「…」→「KGの関係先を追加」。名前・分類・関係で絞り、条件を変えながら選択してまとめて追加する。

検証は開発者であるAIによる操作・機能確認。今回の三点に対するユーザーの体験評価は、これからβの実物で行う。
