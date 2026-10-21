# コミュニティ接続確認版

既存Home・Explorer・会員画面を再利用する、隔離Nextプレビュー。従来の静的トップ／架空SVG Graphを接続画面として使わない。

## 起動

WSLのリポジトリで、通常の手動作業ロックを取得してから：

```sh
python3 prototypes/community-connected/prepare.py
cd ~/.local/share/plunode-community-connected
GRAPH_DATASET=public-kg /tmp/graph-knowledge-node/bin/node node_modules/next/dist/bin/next build --webpack
cd /home/isinxnisi/1.projects/7.graph-knowledge
python3 scripts/start-local-previews.py community --node /tmp/graph-knowledge-node/bin/node
```

確認先： http://localhost:3275 / https://graph-com.isinxnisi.com/
既存3200を起動済みにする。既存プロセスがいる場合、launcherは上書き・強制終了しない。更新時はPIDファイルとコマンドを照合し、この確認版のrun.mjsだけを停止してから再生成する。

- 生成先は `~/.local/share/plunode-community-connected`。リポジトリの本線app/components/libは編集しない。
- `prepare.py` は既存コンポーネントをコピーして、限定した接続オーバーレイを適用する。対応するコードが変わればassertで停止する。生成先の指定されたsourceフォルダだけを置換する。
- テンプレートは `.txt`。本線のTypeScript／Next routeには入らない。元コミュニティモデルの権限・版の意味は変えない。
- 生成版はNext buildで型検証する。本線3200のbuildは再生成しない。
- ログ/PID：`~/.local/state/plunode-previews/community.{log,pid}`。端末から分離して稼働。OS/WSL再起動後の自動起動・監視は未導入。

## 隔離

127.0.0.1:3275待受。Host完全一致で `localhost:3275`、`127.0.0.1:3275`、`graph-com.isinxnisi.com` だけを許可する。既存Docker/cloudflaredのhost.docker.internal経路を使用し、Tunnel/DNS/Accessは変更しない。

サーバーへ渡す環境はpublic-kg用Neo4j接続・読み取りtimeout等だけ。HomeのSSRは既存読み取り実装を利用し、ブラウザのKG通信はallowlistの読み取りAPIだけ3200へプロキシする。Cookie・認証ヘッダーは転送しない。会員/auth/AI APIは存在せず、会員取得はブラウザ内の架空adapter。実書込、リンク発行、削除などは未接続。CSPはsame-origin通信/iframeのみ。

架空データ全体は公開配信されるfixtureであり、試作内の権限表示テストを本番のアクセス制御と混同しない。非公開の実データを投入しない。ロール切替は確認版にしか生成されない。

## 動作確認

```sh
LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu /tmp/graph-knowledge-node/bin/node prototypes/community-connected/navigation.test.mjs
CONNECTION_ORIGIN=https://graph-com.isinxnisi.com CONNECTION_SHOTS=/tmp/community-connection-tunnel LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu /tmp/graph-knowledge-node/bin/node prototypes/community-connected/navigation.test.mjs
LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu /tmp/graph-knowledge-node/bin/node prototypes/community-connected/environment.test.mjs
node --test prototypes/community/model.test.mjs
```

ブラウザはPlaywright Chromium。iPhone実機/WebKit確認とは異なる。スクリーンショットはテスト指定先 `/tmp/community-connection-*`。採用分は検証記録のassetsに保存する。
