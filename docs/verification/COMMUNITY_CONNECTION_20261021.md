# 本線UIとコミュニティ接続確認（2026-10-21）

対象：本線ソース `07ee6a9` に、今回の隔離生成オーバーレイを適用。生成Next build `uFw7fcN6_8Hr5IuAZE4lt`。元ソースへの機能変更・本番配置なし。

## 環境

| 確認先 | 結果 |
| --- | --- |
| localhost:3200 | Home・dataset 200。既存build `eusXcY7MiIipnZvBtkKVt` を継続 |
| graph-beta.isinxnisi.com | Home・dataset 200。既存UIのまま |
| localhost:3275 | 隔離NextのHome・Explorer・会員/コミュニティ画面と日英操作成功 |
| graph-com.isinxnisi.com | 同じ生成build、JS/CSSを実行し日英の全往復成功 |

全確認先の公開revisionは `82b01515-594c-48ca-b4b6-515eefac83ca`。3275はloopback待受のまま。既存cloudflared接続を再利用し、Tunnel/DNS/Access変更なし。Host偽装2種は404。公開KG・会員DB・収集Worker・Kev・本番は変更していない。

## 確認した往復と状態

`navigation.test.mjs`：ローカル、外部graph-comそれぞれ日本語/英語 × 1440/390px。

- A：実Homeから一覧、個別コミュニティ、Capsule掲載、実Explorerへ移動し、同じコミュニティ/Capsuleタブへ戻る。ブラウザ戻る/進むも一致。最終外部テストでは狭幅の一覧scrollYも一致。
- B：実Graphで配置・ズーム・パンを変え、アカウントの参加/運営メニュー→管理→元アカウント→元Graph。ノード/Claim集合、座標、zoom、panが一致。外部最終テストの英語2幅では `other-works` を実適用し、同じ操作で復元した。
- C：実MemberCapsulesの自分のCapsule→既存Readerで選択→掲載先→元Reader。選択Capsule query・メニューhashが一致。
- ページ例外なし、横はみ出しなし、実member/authへのブラウザ通信なし。
- 直接コミュニティURLには架空の戻り先なし。ロールを閲覧者に変えた非公開コミュニティは閲覧不能。私的本文を描画しない。
- /api/member/profile、/api/auth/sign-in、/.env.public、/server.mjs、書込POST /api/entitiesは404。

従来のcommunity model負例22件成功（遅延応答・除外/公開停止・AI許可取消・所有保全・独立会話の寿命・貢献非重複を含む）。実データのセキュリティ試験ではなくfixtureモデルの確認。

生成Nextのbuild/TypeScript成功。Python構文・差分検査実施。既存 `pattern-node-expansion.spec.ts` 2件成功（日本語1280px・英語390px、約1.5分）。通常/パターンの開閉・再開、ダブルクリック/タップ詳細、共有Entity、根拠表示、保存View/Workspace、再読込、自由探索切替とUndoを既存実装で確認。新MJSのESLintも成功。

## 画面比較

同じ1440px幅： [既存トップ](assets/community-connection-20261021/1440-baseline-top.png) ／ [コミュニティ入口追加](assets/community-connection-20261021/ja-1440-top.png)

同じ390px幅： [既存トップ](assets/community-connection-20261021/390-baseline-top.png) ／ [入口追加](assets/community-connection-20261021/ja-390-top.png)

- [既存Graphの段階展開](assets/community-connection-20261021/ja-1280-graph-branches.png)
- [探索中Graphとヘッダー入口](assets/community-connection-20261021/en-1440-graph.png)
- [既存機能を含むアカウントメニュー](assets/community-connection-20261021/en-1440-account.png) ／ [スマホ幅](assets/community-connection-20261021/en-390-account.png)
- [密度調整後ホーム](assets/community-connection-20261021/ja-1440-community-home.png)
- [PC Capsule一覧](assets/community-connection-20261021/ja-1440-capsules.png) ／ [スマホ一覧](assets/community-connection-20261021/ja-390-capsules.png)
- [管理と明示戻り](assets/community-connection-20261021/ja-1440-management.png)

Graph画像では復元試験のため位置/ズーム/パンを意図的に変更している。画面レビューで、スマホの入口が既存supportLinkの非表示規則に巻き込まれる問題と、frameが前画面の高さを保持して余白を増やす問題を検出し、確認版のクラスと内容高さ計測を修正した。

## 限界・次の判断

- Chromiumの狭幅/タッチエミュレーション。iPhone実機・WebKitは未確認。
- 会員・掲載・管理・AI設定は架空データ。Graphのみ実Explorer・公開KG読み取り。掲載Capsuleの参照先対応はデモであり、実会員の権限付きCapsule Graph連携の完成を意味しない。
- 個人Capsuleの保存、限定リンク発行、招待配送、実投稿、外部AIは未接続。既存画面の構成・Reader・メニューを評価する確認版。
- 実認証の失効、実Capsule公開版との照合、サーバー側権限キャッシュの破棄は後工程。画面だけの権限制御を本番へ移さない。
- 起動元terminalから独立して稼働するが、PC/WSL再起動後の自動起動監視は追加していない。READMEの起動手順を使用。

[設計判断](../design/COMMUNITY_CONNECTION_PREVIEW.md)／[起動・再検証手順](../../prototypes/community-connected/README.md)
