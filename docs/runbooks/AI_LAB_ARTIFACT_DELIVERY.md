# AIラボ：公開artifactの更新と復旧

Issue #36の準備手順。配置・権限変更の承認ではない。VPSへのWeb反映・新しいdirectory/bind mount・ラボ有効化は未実施。通常の[Web更新規約](../design/PRODUCTION_DEPLOYMENT.md)を維持し、KG applyや公開ゲートの導入scriptを再実行しない。

## 配置物

- Web image：本線UIと公開JSON1版・静止PNG1枚。モデル・torch・推論API・実験runを含まない。Web UIDは同梱artifactと親directoryへ書き込めない。
- 任意の `lab-artifact-ops` image：単回の検証／版切替用。会員/KG env、DB接続、SSH、Kev、資格情報を持たない。image内のNode/tsx/Zodで動き、VPSへNodeを追加導入する必要はない。
- 任意の `compose.ai-lab-artifact.yaml`：承認済みの公開専用directoryをWebへread-only bindする候補。初段同梱版だけなら不要。既存Compose/Caddyを自動変更するscriptではない。

両imageは開発側で固定commitからbuildする。VPSではbuildしない。imageとchecksumを既存の管理者配備手順で扱い、受入済みWeb以外のサービスを再起動しない。初段は `AI_LAB_ENABLED` 既定0。有効化をWeb更新とは別に確認する。

## 公開入力の検証

検証は読み取りだけ。固定コードのrepo rootで次を実行できる。

```sh
npm run ai-lab:artifact -- validate data/ai-lab/initial.json https://plunode.net
```

SHA-256と公開KGの検査時revisionを返す。失敗を旧KGや別モデルで補完せず停止する。raw応答・wire・private run・採点案を入力に渡さない。公開JSONは256,000 bytes以下・schema v1・全field許可制。v1は実推論0/追加学習0の契約で、実推論・学習の記録を公開する際は別契約版をレビューする。

## 任意の更新directory

実配備前に運営者が絶対path、publisher UID、Webのread権、容量と保持を確認する。入力stageは公開JSONのみ、出力は公開専用directoryのみ。KG backup、会員内容、資格情報、実験runと同じdirectoryを使わない。Webにはread-onlyで渡し、publisherだけが書ける状態にする。今回この権限設定は実行しない。

承認後の単回containerの例。PUBLIC_INPUTとPUBLIC_DIRECTORYは運営者が検証した絶対path、TAGは受入済み固定image、EXPECTEDは取得済みcurrentのSHA-256（未設置時だけnone）。既存directoryを推測して使わない。

```sh
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 256m --cpus 0.5 --pids-limit 64 \
  --mount type=bind,src=PUBLIC_INPUT,dst=/input.json,readonly \
  --mount type=bind,src=PUBLIC_DIRECTORY,dst=/output \
  graph-ai-lab-artifact:TAG activate /input.json https://plunode.net /output EXPECTED
```

public HTTPSへだけ接続する検証コードを固定し、KG/会員envを注入しない。会員DB/network、公開apply用の鍵、model/cacheをmountしない。初回を含め同梱の固定履歴を落とした新版は拒否する。新品のrelease fileをfsync後にpointerを原子的renameし、directoryもfsyncする。現版違い・検証失敗・既存同名異内容・競合は拒否。最後に `/api/ai-lab` のhashと画面の時刻・件数を確認する。

pointer切替後のI/O異常・process終了・応答消失では、完了状況が不明になり得る。成功を推測せず、currentと保持file・HTTPのhashを照合してから次のEXPECTEDを決める。現版を確認せず同じ更新を繰り返したり、旧版へ自動で戻したりしない。

## rollbackと中断

復帰先は保持済み `releases/OLD_SHA.json`。同じactivateにそのfileと現在のEXPECTEDを指定し、公開KG参照を再検査する。`current.json`を手書きせず、新版や旧履歴も削除しない。Web image自体の不具合は既存Web更新手順で旧imageへ戻す。KGをrestoreしない。

更新processが強制終了して `.activation.lock` が残っても閲覧は旧pointerで続けられる。自動でlockを消して再実行しない。運営者がprocess不在・directory・現pointer・immutable release・中断位置を確認してから、当該artifact専用のlockだけを整理する。共通Autopilot/Worker/publication lockは触らない。

受信した更新の破損時はWebが直前に検査済みの版を維持し、冷起動は同梱版へfallbackする。新しい記録として時刻を更新しない。更新後は期待hashの外部確認が必須で、fallbackを更新成功と報告しない。少なくとも復帰可能な旧版を保持し、世代削除は別の容量判断とする。

## VPS読み取り診断の未完事項

2026-10-22、既存一般SSH経路をBatchMode・StrictHostKeyCheckingで試したが、plunode.netのED25519 host keyを既存known_hostsで照合できず、認証前に停止した。別鍵の試行、鍵の取得／登録、専用公開ゲート鍵の流用、sudo/権限/Caddy変更はしない。

運営者が既存の認可済み一般接続とhost keyを確認した後に、通常利用時の `date -Iseconds`、`uptime`、`nproc`、`free -m`、`swapon --show`、`df -h /`、processのCPU/RAMを開始時・数分後に読む。Docker閲覧権が既にある場合だけ `docker stats --no-stream` と状態を読む。inspect/env全体・会員本文・秘密情報は取得しない。Web/Neo4j/会員PG/同居serviceの使用量・再起動・swap差を分け、見えない値を0としない。

今回のVPS確認は公開HTTPS APIと公開KG参照照合まで。VPSの4GiB級構成での実資源、実配備後の冷起動／再起動／PC停止中の外部閲覧、実Google/コミュニティ非退行は公開判断前に残る。ローカルcontainer試験をVPS実測として報告しない。GPUや実推論成功は、この診断や初段公開の前提ではない。
