# Capsule編集機能の実装・検証記録

2026-10-29 / Issue #63 / `capsule-contribution-001 / r02`

## 対象と反映状態

- 基点: `952c8fb59fa6ca311121d81a641d3d1b847e7dee`（main）。実装branch: `feat/capsule-editor-001`。
- [実装契約](../design/CAPSULE_EDITOR.md)に基づくCapsule先行実装。知識登録・本線KGへの申請は準備中のまま。
- この記録はクラウドの一時確認環境での結果。既存開発PCの3200、HTTPS beta、正式VPSの更新を意味しない。
- 実装・クラウド検証を完了。日本語commitとGitHubへの反映を行い、配置は既存の管理経路へ引き継ぐ。固定ソースはこの記録を含むGit commitから参照する。

## 確認環境

| 項目 | 実際に使用した環境 |
| --- | --- |
| Node | 24.21.0（repo指定版） |
| Web | Next.js 16.3.8。匿名の最終確認はproduction buildのdemo dataset・一時3210、会員確認はfixture専用3221 |
| Graph DB | 一時Neo4j Community 5.26.31。既存demo fixtureのみを投入 |
| 会員DB | 一時PostgreSQL 17.10、localhost:55432の専用DB。各suiteは一意のschemaとsearch_pathで分離 |
| 認証 | fixture OIDC。実Googleの認証確認ではない |
| ブラウザ | Playwright 1.63.0からChromium 134.0.6998.35を起動。日本語表示にNoto Sans CJK JPを使用 |
| 画面幅 | 1440pxと390px。狭幅はエミュレーションでありスマホ実機確認ではない |
| 排他 | 元の開発PCのAutopilot設定・processがこの環境に存在しないことを確認。AGENTS.mdの別環境例外を適用 |

本線KG、既存会員DB、betaのprivate設定、VPS、Kev、AI教育Worker、日次予定、AIラボのartifactへ変更を加えていない。旧Capsule削除はユーザー承認済みだが、この実装・検証で既存環境のCapsuleを削除してはいない。

匿名シナリオでは、一時Webで無効にした会員サービスの503と通常の未ログインを混同しないため、profile応答だけを401に固定する。通常のGraph読取は実Neo4jを使い、KG変更・取得失敗を確認するケースだけ対象応答を意図的に差し替える。会員ブラウザsuiteは認証・保存・KG・共有・Communityの各APIを差し替えない。

## 自動確認

| 確認 | 結果と範囲 |
| --- | --- |
| 会員・共有・Community・運営の実PG結合 | **101 passed / 1 skipped**。下表の5 suite。初期の8件・12件のCapsule実行は最終13件に置き換え、二重計上していない |
| 全体の単体・UI | **85 files / 938 passed / 0 failed / 0 skipped**。`npm test -- --maxWorkers=2`。最終実行は11:02:18〜11:03:02 UTC |
| 匿名Capsule・通常Graphの実ブラウザ | **12 passed（39.0秒）**。最終production buildに対し`capsules.spec.ts`、`capsule-editing.spec.ts`、`capsule-kg-editing.spec.ts`、`graph-motion.spec.ts`を順次実行 |
| 実会員のブラウザ結合 | **1 passed（55.3秒）**。`capsule-member.spec.ts`でfixture認証からPG保存・固定版共有・Community往復まで確認 |
| lint・語彙・関係モデル契約 | 全体実行成功。最後の小修正は別途affected lintを確認 |
| 型検査 | `npm run typecheck`（route type生成＋TypeScript）成功 |
| production build | **成功**。Node 24.21.0、demo dataset、会員／Community／運営を無効にしたWeb。最終build ID: `t780wdS4bDHZZY4cqZAOR`。本番public-kg用Docker imageのbuildではない |

| 実PG suite | 成功 | skip |
| --- | ---: | ---: |
| `capsule-document.integration.test.ts` | 13 | 0 |
| `member.integration.test.ts` | 31 | 1 |
| `community.integration.test.ts` | 29 | 0 |
| `community-safety.integration.test.ts` | 14 | 0 |
| `site-operations.integration.test.ts` | 14 | 0 |

skipしたのは、DB全体の接続停止・backend強制終了を行う既存障害テスト。このクラウド検証ではschemaを共有DB上に分離する方式のため、他の検証接続を停止しない。`member-cold.integration.test.ts`は未実行。正式のDocker runnerでは専用DB全体を隔離する既存方式を維持する。

Capsuleと既存会員は最終server挙動変更後の10:20 UTC台に成功。Community／通報／運営はその後の総量quota共通処理も含め、11:05:06〜11:05:15 UTCに57件を再実行して成功した。runnerの表示時計はAmerica/Los_Angelesであり、UTCへ換算して記録する。再実行を総件数へ加算しない。

会員ブラウザ確認は2026-10-29 10:59 UTC開始の最終実行で成功。実測はprivate Capsule 1件・revision 2、限定共有1件・固定revision 1、Community掲載1件・固定revision 2、独立した会話1件。本人がprivate版を更新しても、匿名Readerが読める固定版は更新されない。閲覧中の位置・pan・zoomと未適用のタイトル入力は、visibilityイベントで非表示にして実profile再確認を挟んだ後にも保持され、非表示中はprivate内容を表示しない。

このbrowser fixtureはプロフィール・運営を有効にしないため、ledgerは000〜007と011／012の10件。実PGの結合suiteは000〜012の13件を検査する。既存beta／本番の000〜010へ追加適用する場合の13件という公開契約とは対象flagが異なる。

### 確認する主要な操作と境界

- 表示中のGraphから命名・選択ダイアログなしで編集開始。KG由来の個別Claimと配置を保存する。
- 独自対象、根拠、自由テキストを編集し、明示保存後に再読込。KG読取が失敗しても保存断面から閲覧する。
- 閲覧中の一時配置を編集へ引き継ぐ。複数選択・まとめて移動・Undo/Redo・破棄を通し、破棄後は編集前の閲覧配置へ戻る。
- 通常GraphのCtrl/Meta複数選択は探索展開を発生させず、まとめて移動できる。
- 別タブでの保存競合時は入力を保持し、別Capsuleとして保存できる。
- KGの本文差、同じ取得範囲の関係増加、取得失敗を区別。比較で元の文書を自動更新しない。
- KGの実際の関係先から、選んだ個別ClaimとEntityだけを戻す。検索で追加したKG Entityへの接続は独自関係として保存し、任意ラベル・説明の編集後もKG参照へ混入しない。元の実API応答は操作前後で不変。
- 本人保存・期待revision・request ID再試行・一覧summary・容量制限・migration未準備をサーバー境界で確認。
- 固定共有版とprivate更新、Community掲載版、関連会話、世代別閲覧権、撤去、対象版の運営停止を区別する。

### 実行環境による中断

途中で全体Vitest、lint、2つのNext開発サーバーとChromiumを並行実行し、8GiBのメモリ上限へ達した。その時のタイムアウトをアプリケーションの最終判定に使わず、該当実行を中断した。最終確認はWebブラウザ、全体テスト、buildを順次実行し、Vitestのworkerを2に制限する。

会員の初回実ブラウザ実行では、PostgreSQL JSONBによるobjectキー順の正規化を別更新と誤認するclient不具合を検出して修正した。意味の等しいobjectは一致とし、配列順など実内容の差は競合として保持する回帰を追加。次の実行では開発サーバーの初回route compilationによる全画面reloadが確認を中断したため、実HTTPで使用routeを準備してから接続し、最終実行を完走した。入力やassertionを緩めて成功扱いにはしていない。

最終の表示文言調整後、Turbopackの既存生成cacheを再利用したbuildで読み込みエラーが発生した。旧生成物を作業用領域へ保持し、空の生成先から同じソースをbuildして成功。その最終生成物に対して上記12件と記録用画面の再確認を行った。

## 実画面

いずれも実装したWebと架空のdemoデータを使ったスクリーンショット。静的mockupではない。

- [PC・編集中](assets/capsule-editor-20261029/editing-1440.png)
- [390px・編集画面の上部](assets/capsule-editor-20261029/editing-390.png)
- [390px・選択対象と根拠](assets/capsule-editor-20261029/editing-390-detail.png)

青い枠と控えめな光、Capsule共通アイコン、編集状態、独自対象の分類、独自関係、自由テキスト、選択内容と根拠を確認した。狭幅では詳細をGraphの下へ配置し、横方向の文書overflowがないことを自動確認した。

## 追加migrationと再現

追加は011（文書・更新receipt）と012（Community固定版掲載）。既存000〜010の内容・checksumは変更しない。Web起動時の自動migrationは追加していない。

| 追加ファイル | SHA256 |
| --- | --- |
| `011-capsule-documents.sql` | `7f16684ea9bd43148586362d095dd3d88cf5f4881502f7dab04cd9a401aef8b9` |
| `012-community-capsules.sql` | `cbde4ac6caf678a92f48100603b7bbacf41cc2f7b5e1632a0b1810ea3a4a03ea` |

既存の隔離Docker環境では、次を用いる。

```sh
npm test -- --maxWorkers=2
npm run typecheck
npm run lint
npm run test:member -- --capsules
npm run test:member -- --capsules --e2e
```

`--capsules --e2e`は新しい会員ブラウザsuiteを選択し、fixture DBへ011／012を明示適用する。その他の既存会員・Community・運営suiteと、beta／VPS用の引数・backup・切替・復旧手順は[公開runbook](../runbooks/CAPSULE_EDITOR_RELEASE.md)を参照する。

## 公開へ残る実環境確認

このクラウドには、既存開発PCのruntime／共通Autopilot lock、Docker実行環境、対象VPSのSSH接続がない。次を既存の管理経路で行う必要がある。

1. 検証済み固定SHAから本番用imageを作り、image内のoperatorで移行・backup復元を確認する。
2. 既存betaの会員DBへ011／012を適用し、3200とHTTPS betaの両方で確認する。
3. 既存VPSのWeb／member-opsのみを切り替え、正式HTTPS・実Google・既存機能との往復を確認する。

会員用の文書本文はアカウント保存できる。最近使ったもの・お気に入りはmember IDを含むブラウザ内metadataであり、端末間同期の実装ではない。自動保存、知識申請、審査queue、KG merge、追加AI推論は今回有効にしない。
