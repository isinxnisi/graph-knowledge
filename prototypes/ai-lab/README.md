# AI育成ラボ：隔離した観察画面

確認URL: **http://127.0.0.1:3268/ai-lab**。ユーザーが設定済みのCloudflare Tunnel経由で **https://graph-ailab.isinxnisi.com/ai-lab** も利用する。2026-10-22の明示指示で、この隔離プレビューの接続だけを許可。beta・VPSへの配置や再起動後の自動起動はない。

Home・Explorer・アカウント・Claim Readerは既存コンポーネントをコピーして生成する。元の `app/components/lib`、コミュニティ試作、3200/3275は変更しない。生成物は `experiments/ai-lab/.runtime/observer` に隔離する。

## 起動と検証

別terminalで `make autopilot-hold` を保持し、表示されたTOKENでreviewする。既存の3268／互換3286が使用中なら所有プロセスを確認する。生成先のソース置換・buildの前に、この確認版だけを終了する。PIDと `/proc/PID/cmdline` の `prototypes/ai-lab/run.mjs` の絶対パスを照合してからSIGTERMを送り、別プロセスを止めない。

```sh
python3 scripts/autopilot.py review --token TOKEN
python3 prototypes/ai-lab/prepare.py --token TOKEN
cd experiments/ai-lab/.runtime/observer
GRAPH_DATASET=public-kg NEXT_TELEMETRY_DISABLED=1 \
  /tmp/graph-knowledge-node/bin/node node_modules/next/dist/bin/next build --webpack
cd ../../../..
python3 prototypes/ai-lab/serve.py --token TOKEN
```

`serve.py` はloopbackの3268と3286が空いていることを確認して起動し、PIDとlogをラボの `.runtime/observer.{pid,log}` に保存する。共通ロックを解放しても、読み取り画面はレビューのため稼働を継続する。推論・学習・ジョブを起動する機能はない。

既設Node24とmainのnode_modulesを読み取り利用し、package install・依存更新はしない。Home/GraphのSSRは既存public-KG読み取り処理を再利用するため、mainの `.env.public` のNeo4j接続4項目だけを起動processへ渡す。会員DB・Google・広告・計測の設定を継承しない。ブラウザのKG取得は3200へのallowlist読取proxy。Cookie/Authorizationを転送しない。DiscoveryのPOSTは既存の読取検索4経路だけ。

通常の閲覧・ルート復元以外のKG操作を実装せず、seed/migrate/apply routeも含めない。Neo4j側の専用read-only principalを新設した訳ではないので、OS/DB権限による強制的な読取専用化の完成とは扱わない。今回のTunnel確認も既存の読み取り処理だけを公開する。DB権限・資格情報を独立させた正式配信環境の構築は別工程である。

会員画面は既存の未接続表示を利用する。架空User・Capsule・ログイン成功を作らず、会員/auth APIは503、AI/学習APIは404。Hostはlocalhost:3268、127.0.0.1:3268、graph-ailab.isinxnisi.comの完全一致だけを許可し、no-store/noindex、same-origin通信、iframeなしを指定する。

```sh
# 既設tsxの位置は当該PCのmain node_modulesを指定
/tmp/graph-knowledge-node/bin/node \
  --import /home/isinxnisi/1.projects/7.graph-knowledge/node_modules/tsx/dist/loader.mjs \
  --test prototypes/ai-lab/state.test.mjs
LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu \
  /tmp/graph-knowledge-node/bin/node prototypes/ai-lab/navigation.test.mjs
```

Cloudflareの既設トンネル・DNS・Access設定は変更しない。3268をloopbackで起動し、トンネルからこのoriginへ接続する。本体は3268、旧3286は同じwrapperが管理するloopback中継として維持する。外部502は3286中継の追加で200になったため、既存トンネルの実到達先を保全する。中継も完全一致Host制限を持ち、停止時には本体と一緒に終了する。キャラクター比較は /ai-character-study。ホストPC・WSL・プレビュー停止中は閲覧できない。

AI_LAB_ORIGIN=https://graph-ailab.isinxnisi.com を付けると、同じブラウザ検証をTunnel経由で実行できる。

## データの更新

表示は `docs/verification/ai-lab-20261022` の固定公開artifact・review・診断要約から生成する。raw応答・runtime・wire・private recordは配信しない。生成時に保持中の元実行記録から公開投影を再計算し、hashだけでなく全体一致を検査する。このため、private実行記録のない新規cloneではそのまま生成できない。検証済みartifactだけを受け取る公開配信経路は初段公開前の別工程。

```sh
python3 experiments/ai-lab/review.py --token TOKEN --output NEW_REVIEW_DIRECTORY
python3 experiments/ai-lab/review.py --check --output docs/verification/ai-lab-20261022
python3 experiments/ai-lab/training_preflight.py --token TOKEN --output NEW_PREFLIGHT_FILE
```

レビュー資料は開発用の採点案を明示的に表示する別工程であり、モデルrequestへ渡さない。最終評価の秘密labelsを画面やrepoへ置かない。`training_preflight` は既存imageのIDを固定した一時コンテナの境界・package metadata・safetensorsヘッダー検証だけ。GPUを渡さずモデルをロードしない。実学習用runtimeの作成・実学習・checkpoint差替えは含まない。

## 往復の契約

- Home/Graph/アカウントの共通ヘッダーからラボへ。明示入口だけをsessionStorageへ保存し、直接訪問で架空の戻り先を作らない。
- ラボのtab/filter/runはURLへ。Graph/Claimへ移る際は開いている根拠欄とスクロールも保存し、明示リンクで復帰する。Claimのmodal内にもラボへの戻りを出す。
- Graphの枝・座標・zoomは既存のURL再検証を再利用する。panだけを隔離版のsessionStorageへ最大10件、URL・KG revisionに結び付けて補足する。KG再検証失敗時は適用しない。既存保存schemaは変えない。
- 現在のGraphと評価時の固定KGの版差を表示する。AI実推論・API失敗/結果不明・送信前保留・非AIのHOLD・ラボ追加学習を別軸で扱う。未確認の学習flagだけでは「学習済み」にしない。

確認対象は日英・1440/390幅・Chromium。実Googleログイン、本人の会員データ復帰、iPhone実機/WebKit、VPS配信の受入は別途。
