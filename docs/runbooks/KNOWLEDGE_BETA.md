# 知識読取・年表付きCapsuleの段階β

U4中間工程。正式VPSへの配置手順ではない。既存3200とHTTPS βのGoogle認証・会員DB・Capsule・コミュニティ・通常KG・AI artifactを保持する。

## 起動・再開

受入済みmainで、共通hold・token確認後に既存launcherを使う。

```sh
python3 scripts/start-local-previews.py beta --node /absolute/path/to/node24
```

既に3200が使用中なら何も停止せず拒否する。所有PID／cwdを確認し、更新時だけ既存β Webを止める。`~/.local/state/plunode-previews/beta-knowledge.json`は0600で既存user所有。ここには専用知識PG・Neo4jとβ originだけを保存する。認証・会員DBは従来のprivate設定を引き継ぐ。launcherは事前構築済みの`plunode-knowledge-beta-postgres`／`plunode-knowledge-beta-neo4j`のlabel・volume・loopback portを照合して起動し、mainの通常publisherを起動する。DB生成・migration・seedは行わない。

Web logは従来の`beta.log`、publisherは同じstateディレクトリの`knowledge-beta-worker.log`／`knowledge-beta-worker.pid`。他のprocessのPIDなら置換しない。Webとworkerを更新する場合は、それぞれのcwd／cmdlineを確認して正常終了させ、同じlauncherで再開する。volume削除で復旧しない。

## 初回構築・明示migration

専用PG 55476 / DB `plunode_knowledge75_beta`、Neo4j 7699を使用。3276の55475／7698、会員55433、通常KG7697と分離する。既存`migrations/knowledge-foundation/001-records.sql`と`002-publication.sql`のchecksumを保持し、明示seedコマンドがschemaを確認・適用する。Webは適用済みchecksumを検査するだけ。

`knowledge-beta-seed.ts FILE SHA256`は選択された公開Theme 3件の固定入力だけを許可する初回移行用。空の専用DBにだけ適用し、同digestの再送は既存結果、別digestは拒否する。別のデータを追加するために既存DBを空にして再実行しない。新しい登録・移行は別操作として設計する。

backupはprivateなfresh directoryへcustom dumpを作り、別名DBへ復元して全tableの行fingerprintとchecksumを照合する。会員DBにmigrationは不要だがWeb切替前のbackupも別名DBへ復元し、会員・コミュニティの保持を確認する。旧dumpでlive DBを上書きしない。

## 更新・復旧境界

検証済み固定SHAをmainへ受け入れ、通常push後にpublic buildを配置する。新形式Capsuleを保存した後は、それを読めない旧Webへ戻さない。知識読取側の障害は設定を無効にして通常探索を維持し、保存済みの新Capsuleは対応版Webで保持する。原記録正本・公開世代・会員DBを一括resetしない。

確認先は `/api/knowledge/public?mode=status`、TOP紹介／新着、テーマ検索、年表から会員Capsule保存・再訪、通常Graphから任意年表追加。βで `/api/knowledge` と `/api/themes` が無効であり、別Hostや正式originへ誤接続しないことも確認する。新形式の共有は接続完了までサーバーで閉じる。実Googleとfixture、HTTP・実画面・iPhone実機は区別して記録する。
