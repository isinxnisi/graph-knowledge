# 再開・更新・復旧の境界

今回の資材作成はinstallしない。設置操作は固定差分に対する運営者承認後に行う。既存のIssue33の保護経路・公開gate・ロック取得順・署名契約を維持する。

## 更新前

1. 最新のVPS読取inventory、全12 receipt、Worker config/base/collector/旧依頼hash、署名済み配送・exclusion・pending auditを確認する。未完了nonceがあれば同nonceの完了/調査を先に行い、更新しない。
2. `SHA256SUMS` 自体を判断票の固定SHAで検証し、その後全assetを検証する。root側はroot所有0700のstageへ固定資材をコピーする。未信頼directoryから直接実行しない。
3. 現在のconfig・program manifest・差替えファイル・Windows Task XML/Actionを私有backupへ保存する。鍵・承認・receipt・reservation/exclusion/journalのbytes・所有者・inodeを保全する。imageは既存のarchive検証方式でconfig/OCI/layer hashを検証してからloadする。

## 承認後の適用順

既存の通常idleを確認してWSLの共通lock/preparation lock/Worker lockとVPSの既存activation lockを、それぞれ既存契約の範囲だけ取得する。ロックの削除・強制終了・新しい分散ロックは導入しない。待機中や稼働中のWorkerを停止して更新しない。

1. 検証済みimageを両配置先へloadし、archiveのconfig ID/OCI IDの対応とNode24.21を確認。再buildしない。
2. 承認済みmain統合を経たWeb imageだけを既存Web-only手順で更新する。composeのimage以外、env、DB container、member schema/migrations、KGを変更しない。Web metadataが候補build/能力と一致するまでpreparationは旧版のまま。
3. Workerの指定5ファイルだけをbackportする。base commit、collector hash、config、既承認依頼・receiptは維持。適用前後の固定hashを確認する。新しいmain全体をWorkerへ配置しない。
4. VPS gateのexecutor/cycle 2ファイル、program manifest、operator pin、`compatibilityRequired:true` だけを更新する。既存root wrapper/SSH/sudoers/keys/journalsは保持。既存wrapperの `verify_installation()` をrootで読取実行し整合性を確認する。
5. WSLに固定sourceをroot所有・書込不可で追加し、approverとdelivery configだけを固定差分で更新する。`--self-check` がsigned=false/applyCalls=0で通ることを確認。Windows `Plunode-Publication-Delivery` のAction末尾commitも同じsourceへ更新し、trigger/principal/settings/hidden launcherを維持する。WorkerやWorkStatusタスクは変更しない。
6. 正式受入を伴わない同一公開dataの読取preflightを3利用側で実施し、実Node・source・image・live Web能力を照合する。公開済み36 Claimを再公開する候補やnonceを生成しない。全12receiptに未公開差分がなければ通常tickはno-pendingであることを確認。

この順序は承認前の実行指示ではない。新規VPS inventoryが不一致なら差分・設定後bytesを確定し直し、承認対象を勝手に変更しない。

## 失敗時

- 適用前にhash/版/receipt/状態が不一致：その場で停止。署名・applyなし。未完了nonceを保全する。
- 新imageはloadだけなら未参照のまま残す。既存imageを削除しない。
- Web-only更新に失敗：保存したcompose imageへ戻し、既存 `up -d --no-deps --pull never web` 経路でWebだけ復旧。DB・env・データのrestoreは実施しない。
- gate/configの変更途中：新preparationを起動する前に、固定backupのcode/config/manifestを一組として戻す。wrapper整合と現在revisionを確認。keys・journalsを過去へ戻さない。
- WSL/Windowsの片側だけ切替：delivery source/configとTask Actionを旧sourceの一組へ戻す。scheduleの有効無効で回避せず、通常idleの既存lock内で整合させる。
- Worker差替え失敗：5ファイルのみbefore bytesへ戻す（新設3ファイルは未参照を確認して取り除く）。config/collector/依頼/receiptへ触れない。
- 退避名衝突修正後のWSL包：`backup/wsl-backup-manifest.json` の元パス・SHA・uid/gid/mode・存在有無を復旧の対応表とする。`worker/<runtime相対パス>.before` と `protected/<絶対パスの先頭slashを除いたパス>.before` を使い、basenameから復元先を推測しない。旧stage `9955a6dbf84c` の途中退避は上書きせず保持する。更新中の例外は既存のメモリ内before bytesから自動差戻しを行う。プロセス中断等で結果不明なら自動再実行せず、実hash・Task参照と対応表を照合してから承認範囲のコード／設定だけを復旧する。
- 署名後結果不明：`publication-delivery.py --config /etc/plunode-publication/delivery.json --job <同nonceのjob.json> --diagnose`。completedなら追加操作不要。終了処理待ちなら既存の同nonce配送だけを再開。不一致なら調査し、新nonce・再署名・再applyは行わない。

## 隔離再現

```bash
export PATH=/home/isinxnisi/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin
npm run vocabulary:check
npx vitest run --exclude '**/.local/**' tests/role-generation.test.ts tests/publication-compatibility.test.ts tests/film-role-registration.test.ts tests/contribution.test.ts tests/step-roles.test.ts tests/saved-workspace.test.tsx
PYTHONPATH=tests python3 -m unittest test_publication_compatibility test_publication_diagnostics test_publication_executor test_publication_delivery test_publication_preparation test_film_manifest test_collection_film test_collection_sequence
```

実Worker工程は `scripts/test-worker-film-compat.py --installed-source --role-overlay "$PWD" --comparison-release publication-8b0b1d67656a15c7e505ba1f --output .local/publication-pipeline/<未使用名>`。実行Nodeはinstalled Workerのbin/nodeを既定とする。

DB/ブラウザ実証は `ops/test-publication-bundle2.py --output .local/publication-pipeline/<未使用名> --worker-root <上記shadowのruntime絶対path> --operator <固定operator-config-ID> --web <固定Web-config-ID> --browser`。3296/3297に既存listenerがある場合は停止する。専用resourceだけをfinallyで削除し、本番3200やDBへ接続しない。ブラウザ補助libraryはこの開発機の `/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu` に依存し、一般環境で未設置なら別途Playwright依存環境が必要。
