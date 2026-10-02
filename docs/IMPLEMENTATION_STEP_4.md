# Step 4 実施記録

実施日: 2026-10-03。検索・グラフ探索・出典詳細を一画面に接続した。Step 5の最終調整、認証・投稿・編集・Wikidata等には進んでいない。

## 作成・変更ファイル

| ファイル | 内容 |
| --- | --- |
| app/page.tsx、app/layout.tsx | ルートの探索画面、ページの日本語メタデータ |
| components/Explorer.tsx | 三列画面と常時表示の架空デモ表示、選択・Graph件数・上限案内 |
| components/SearchPanel.tsx | 人物検索、説明付き候補、空結果・失敗・取得中 |
| components/GraphCanvas.tsx | Cytoscape初期化、Node/Edge操作、配置・凡例・全体表示 |
| components/RelationsList.tsx | 選択Entityの隣接関係のテキスト表示、展開・Claim選択 |
| components/EntityDetails.tsx | Entity・別名、展開状態、続きを表示・再試行 |
| components/ClaimDetails.tsx | 主張カード、Citation/Source/参照箇所、他の同一関係の主張 |
| components/Explorer.module.css | CSS Modulesの画面・選択・否定・空状態・エラー表示 |
| lib/client/api.ts | 同一オリジンの4 API呼び出し、abort・HTTP/通信エラーの表示変換 |
| lib/client/graph-state.ts | Graph型、ID辞書、上限を確認したページの原子的マージ |
| lib/client/use-graph-explorer.ts | React標準stateによる選択・展開・通信制御 |
| lib/client/format.ts | 共通predicate辞書・日付型から日本語の関係名・期間を表示 |
| tests/ui-state.test.tsx | マージ・上限・非同期探索・主張カードの9テスト |
| tests/e2e/explorer.spec.ts、playwright.config.ts | Chromiumによる6つのブラウザテスト、Next.js自動起動・停止 |
| package.json、package-lock.json | Cytoscape、ブラウザ/コンポーネント検証の依存とコマンド |
| .gitignore、eslint.config.mjs | Playwright生成物を除外 |
| README.md、PROJECT_CONTEXT.md、ARCHITECTURE.md | 現在の実装段階、起動・検証方法、UIの具体化 |

既存API、Cypher、fixture、Neo4jのモデル・seedは変更していない。ブラウザからNeo4jへの接続はなく、DB用設定を公開しない。

## コンポーネント構成と状態管理

ExplorerがSearchPanel、GraphCanvas、RelationsList、EntityDetailsまたはClaimDetailsを繋ぐ。ClaimDetails内のClaimCardが選択Claimと他のClaimを同じ形式で表示する。

Graphのnodes/claimsは内部UUIDをキーとする辞書。中心ID・選択Entity/Claim・展開元IDと、Entity別のexpanded/nextCursor/hasMore/loading/error/blockedをReact stateで保持する。検索結果・詳細取得状態は各コンポーネントのlocal state。グローバル状態管理ライブラリは追加していない。

進行中neighborsのAbortControllerをEntity IDごとに一つ保持する。同じEntityの同時取得と展開済みの自動再取得を防ぐ。別Entityの並行応答は直近stateへマージし、応答順によるデータ消失を防ぐ。中心選択は旧通信をabortし、世代番号を更新してGraph・cursorを全リセットする。古い応答は世代番号とabort状態でも除外する。

マージ前に重複排除後の件数を確認する。Entity 100 / Claim 200を超えるページは全体を拒否し、既存データ・nextCursor・hasMoreを維持する。上限を超えたEntityの追加取得を停止し、別の人物を中心に探索する案内を出す。HTTP/通信失敗はcursorを維持し、再試行できる。

## Cytoscape.js設定

Cytoscape.js 3.34.3。EntityのみNode、ClaimのみEdge。Edgeのsource/targetはsubjectId/objectId、labelは共通predicate辞書。targetにtriangleの矢印、並行辺はbezier・control-point-step-size=65。deniedは破線と「否定」の文字を併用し、詳細でも肯否を文字で表示する。

人物は丸、作品は角丸の四角、組織は六角形。中心と選択を枠線で示す。zoom範囲は0.15〜2、ホイール感度は既定値。初回ページ受理時のみbreadthfirstを非アニメーションで実行する。追加時は展開元の周囲8方向・同心円へ新Nodeだけを配置し、既存Nodeの座標・pan/zoomを維持する。必要ならユーザーが「全体を表示」を押す。ドラッグ・パン・ズームはCytoscapeの標準操作を使う。

取得中メッセージの表示切替はCanvasの位置を変えるため、Graph更新時にcy.resize()でクリック座標のキャッシュも更新する。ResizeObserverはサイズ変更に対応する。アンマウント時にCytoscapeとobserverを破棄する。

関連Claimは選択Claimを先に表示し、relatedClaimIdsの詳細を取得してAPIのID順に縦に並べる。肯否・期間・出典を個別表示し、自動判定や順位付けは行わない。関連取得の一部失敗では取得済みカードを残してエラーを案内する。架空SourceのURLはリンクにしない。

## 検証範囲

| 要求 | 検証方法 |
| --- | --- |
| 1. 青葉ハル検索、2. 中心Graph | 実DBのAPIでEntity 5 / Claim 7をブラウザ確認 |
| 3. PersonからWorkへの展開 | Graph上の星の航路クリック、Entity 7 / Claim 9 |
| 4. 循環・重複排除 | 橘ソラ展開後に青葉ハルを再選択して件数維持、状態テスト |
| 5. affirmed / denied | Cytoscapeラベル・破線・矢印を検査、主張カードの文字表示 |
| 6. Edgeから詳細 | C01のCanvas上の線を実クリックしClaim詳細を取得 |
| 7. C01の複数Citation/Source | 出典2件・参照箇所、カードのCitation section 2件 |
| 8. related比較 | C02の2002〜2004年、C03の否定を別カードで表示 |
| 9. 出典未確認 | 佐藤アキのC13をテキスト一覧から選択 |
| 10. 同名人物 | 佐藤アキの2候補と異なる説明 |
| 11. 孤立Entity | 森ユウ、Entity 1 / Claim 0と明示メッセージ |
| 12. 続き | 実APIにlimit=2を指定して2→4→6→7 Claim、取得中・ボタン無効化 |
| 13. 上限 | 生成応答でEntity超過/Claim超過をブラウザ確認。状態テストで100/200境界とcursor維持 |
| 14. API失敗 | 503検索、500近傍、Graph再試行後の復旧 |
| 座標保持 | Work展開前後の既存全Nodeのモデル座標一致 |
| 非同期競合 | 同一ID二重取得・別ID並行取得・中心切替の古い応答・失敗後同cursor再試行 |

通常テストはDB不要。主要ブラウザ経路は既存のseed済み実Neo4jを使用する。fixtureを巨大化せず、上限・エラーはPlaywrightのrouteで応答を制御する。ページングは本物のAPIへlimit=2で転送する。DB停止そのものの503確認はStep 3の統合テストで実施済みで、今回は503のUI表示を検証する。

## 設計の具体化と残る課題

API契約・DB責務・fixture・上限の変更はない。初回breadthfirstと追加Nodeの単純配置、通信のabort/世代管理、デモURL非リンクを採用方針の範囲で具体化した。

Step 5前に残るのは、デスクトップ画面の最終受け入れ確認、長い名称・並行辺ラベルの重なり・大きな表示件数での操作性の評価、キーボード/読み上げの通し確認、応答時間とレイアウトの実測。今回の上限テストは件数制御の保証であり性能保証ではない。画面外の新Nodeは手動で全体表示する。モバイル専用UIや高度な配置は今回の対象外。認証・投稿・編集・外部データ取り込みの設計判断は将来のままとする。

## 実行コマンド

Nodeはリポジトリの固定版24.21.0を使用した。この環境では`PATH=/tmp/graph-knowledge-node/bin:$PATH`を指定した。

```bash
npm install --save-exact cytoscape
npm install --save-dev --save-exact @types/cytoscape @playwright/test @testing-library/react jsdom
npx playwright install chromium
npm run typecheck
npm run lint
npm test
npm run fixture:validate
npm run build
npm run test:e2e
```

この実行環境ではChromiumに必要なlibnspr4/libnss3が標準検索パスにないため、既に展開済みのライブラリを`LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu`でテストプロセスに指定した。リポジトリにはこの環境固有設定を固定していない。一般のLinuxセットアップではPlaywrightのinstall-depsを利用できる。

初回のブラウザ検証でCanvasのクリック位置のキャッシュ問題を検出し、cy.resize()で修正して再検証した。HTTPエラー確認はNext.jsのroute announcerもalertを持つため、表示内容で対象のalertを指定する。テストからCytoscapeのインスタンスを参照して要素の画面座標を取得し、実際のCanvasをクリックする。アプリ側にテスト専用の公開APIは設けていない。

## 最終結果

- `npm run typecheck`：成功。
- `npm run lint`：成功。
- `npm test`：3ファイル、47件成功（既存38件＋今回9件）。
- `npm run fixture:validate`：valid=true。Entity 12 / Claim 15 / Source 5 / Citation 15、Relationship各15、合計47ノード・60接続のfixtureを維持。
- `npm run build`：成功。ルートは静的ページ、既存4 APIは動的経路。
- `npm run test:e2e`：Chromium、6件すべて成功、所要約1.2分。上記14項目を複数経路にまとめて検証。
- `git diff --check`：成功。

今回のブラウザテストは読み取りのみで、Neo4jのデータ変更・停止を行わない。Step 3のDB停止を含む統合テストの再実行は今回の検証に含めていない。テスト終了時にNext.jsの検証用サーバーを停止し、Neo4jは稼働状態を維持する。
