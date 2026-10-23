# 公開状態の同期と定型公開処理（Issue #33）

2026-10-24：正式受入後から人間の公開承認待ちまでの自動接続は [現行配送runbook](../runbooks/PUBLICATION_APPROVAL_DELIVERY.md#2026-10-24正式受入後の候補自動準備現行) を正本とする。completedのroot検証済みapplied artifact＋現行API revisionから候補を作り、承認待ち登録前に既存rootゲートで最新backup／実planを必ず取得する。従来のbackup必須CLIを弱めない。署名済み配送優先、同nonce再開、運用pauseと人間のデータ公開承認の分離を維持する。

第2段階（同日）：固定公開アダプター／wrapper、署名CLI、durable nonce／release予約、WSL challenge peer、通知outboxを隔離実装した。[実装と本番導入の境界](../runbooks/PUBLICATION_GATE_INSTALLATION.md)、[検証結果](../verification/PUBLICATION_GATE_20261020.md)を現在の続きとして参照する。以下の「未実装／将来」は第1段階時点の記録であり、第2段階で実装した機構と、未導入・未検証の本番信頼境界を混同しない。第1段階のread-only CLI／offline policy自体は維持する。

2026-10-20。第1段階は読み取り専用の照合・候補準備、署名承認／失敗復旧の隔離検証まで。本番実行アダプター、root信頼設定、常駐service、定期AI呼出しは追加していない。[実測結果](../verification/PUBLICATION_AUTOMATION_20261020.md)。

## 現在の公開基準と既存Worker

正式受入50 Claim（従来40＋Issue #25の10）は公開済み。公開releaseは `manga-issue-25-utc-recovery-08-normal`、revisionは `88437056-b74f-42ab-88c0-33ed435bdccc`。正式receiptは公開しても書換えない。公開台帳は「正式受入記録」と「固定artifact＋本番revision＋公開後照合」を別々に保持する。

Workerの累積releaseと旧ローカルDBは、最新VPSそのものではない。ローカルDBは旧base `20261014-credits-001`／revision `82b01515-594c-48ca-b4b6-515eefac83ca` のまま。既存のaccepted_additions／discover_acceptedを旧baseに適用した50 Claimは、現在の未公開件数には使わない。現在基準で型＋UUID＋本文一致を照合すると未公開は0。既存Workerは973c7b0のまま、受入完了記録・時間帯・共通ロック・10分休憩を保持する。

既存の受入はsaved receiptとUUID所有を照合し再受入を拒否する。既存本番operatorも使用済みrelease ID・base不一致・drift・既存更新を拒否する。しかし旧Workerの次回release準備が新しい本番baseへ自動追随したという保証はない。今回の独立CLIを公開候補の入口にし、旧累積候補を次回公開へ直接渡さない。Workerの公開比較context更新は別途、現行の検証済みVPS backupを用いた移行判断が必要。同期のためのローカルapply／restoreは行わない。

## 読み取り専用コマンド

repoのPythonで実行し、Nodeは既存runtimeが利用するものをPATHへ置く。rootでの起動と、既存API検証のassertionを無効化する最適化Python（-O／PYTHONOPTIMIZE）は拒否する。読み込むruntimeコードは運営者管理の固定コードに限る。SHAは既知の公開資材記録から固定する。未検証入力からその都度SHAを計算して信頼の根拠にしてはいけない。

```bash
python3 scripts/publication-cycle.py sync \
  --runtime "$HOME/.local/share/plunode-collection-worker-phase-b-20261020/runtime" \
  --published-bundle backups/publication-20261020-50-r2 \
  --bundle-sha bbcdacec982f2e9336a767f68a6aed2da9341b533da3111feaae93ea108a8723 \
  --revision 88437056-b74f-42ab-88c0-33ed435bdccc \
  --output backups/publication-cycle-NEW-OBSERVATION
```

syncは封印資材の全hash、元承認register、正式receipt、本文・依存を既存CollectionWorkflow／Inventoryで検証。全50 ClaimのAPI本文・Role／ISBN scope・全Source／Citation、名前検索・Graphと66 Entityの公開projectionを確認する。revisionを前後照合し、receipt集合と読み込みファイルhashを最終再確認して新規出力をatomic renameする。既存出力の上書きとruntime／Worker home内への出力を拒否する。`ledger.json` が公開済み・未公開の型別UUIDと件数、次回base、`api-verification.json` が経路確認、`source-hashes.json` が入力集合、`result.json` が状態を表す。これらは観測であり受入・公開承認ではない。

`sync` を `prepare` にすると同じ照合後に候補を準備する。未公開0件なら `up-to-date`、release／承認依頼は作らない。使用済み公開release IDを明示すると0件でも拒否する。新規未公開分がある場合は次を追加する。

```bash
  --release '新しい未使用release-id' \
  --public-backup '/安全に受領した最新VPSのpublic-kg-backup.json' \
  --operator-digest 'sha256:別途検証した対応済みoperatorのdigest'
```

既存public_snapshotでchecksum・schema・graph fingerprint・履歴を検証した実backupが必要。base／revisionに加え公開fixtureが固定公開資材と同一でなければ停止する。APIだけではEntity日時・externalIds・全履歴を証明できない。新しい受入集合を既存receipt_projection／mergeから再構築し、未公開差分と完全一致する場合だけreleaseを生成。既存validatorとpublication-backup-plan.tsで既存更新0・追加ありを確認する。入力とreceiptが途中で変われば出力を確定しない。

生成物は `release/`、根拠コピー、`offline-plan.json`、全資材hashを列挙する `ARTIFACT.json`、`approval-request.json`。`verify_prepared_artifact` はmanifest固定hash・各資材・planを再確認し、path逸脱・symlink・追加ファイルを拒否する。生成物内のscriptは実行しない。これはoffline planであり最新VPSの実無書込planではない。状態は `awaiting-live-preflight-and-operator-release`、`productionExecutionEnabled:false`。旧50件用operatorへの直接入力互換は主張しない。将来の信頼済みadapterで既存operatorのvalidate／backup／plan／applyを固定argvで再利用する。

## 公開承認と状態遷移

`観測 → 未公開0` または `候補固定 → 実preflight待ち → 人の公開承認待ち → 署名済み → applying → 公開後検証 → completed` を正規経路とする。候補・approval待ちではロックを保持しない。GitHubへの監査同期失敗は記録送信待ちにし、applyを再実行しない。

公開署名はEd25519で以下をcanonical JSONにして束縛する。収集許可・正式受入の承認を公開承認へ読み替えない。

| 固定項目 | 検査 |
| --- | --- |
| schemaVersion／purpose／environment | version 1、public-kg-publication、production |
| release／baseRelease／baseRevision | 新しいID・実本番base・revision |
| receiptSetSha256 | 全正式receiptの最新集合。追加受入で失効 |
| artifactSha256／planSha256／operatorDigest | 資材全体・最新plan・対応済み固定image |
| nonce／issuedAt／expiresAt | UUID v4、単回使用、timezone明示、最長24時間 |

`scripts/publication-policy.py` は署名・公開鍵pin・全binding・期限・既使用nonce／releaseを**offline検証**する。公開鍵pinは安全な経路で渡す。`--current` と `--journal` はcaller入力の試験資料なので、本番権限の根拠にはならない。CLIは秘密鍵を読み込まず、本番実行を有効化しない。隔離試験だけで一時鍵を作成・破棄する。

将来のroot gateはroot-ownedのtrust／journalから鍵とnonce消費を確認し、実base・revision・固定artifact・最新無書込plan・operator digestを独立計算する。nonceをatomic更新＋fsyncで消費してからapplyを一度だけ呼び出す。journal書込み不能はapply前停止。apply後の通信断では失敗と決め付けず、実DBのDatasetRelease manifest digestと保存済みartifactを確認する。API revision単独では適用同一性の証明にならない。適用済みと証明できれば検証だけ再開。不明・公開後異常は人へ返す。completedでもrevisionが変われば再検証する。自動restore・自動再applyはしない。

最新receipt集合をVPSの公開APIや古いGitHub報告から推測しない。将来はWSLの信頼済み固定preparerが、root発行の短期challengeに対して最新receipt集合を共通ロック下で照合・署名する設計とする。ロック順序はWSL共通→VPS公開ロック。実行直前のattestationからapply結果確定まで共通ロックを短時間保持して受入との間隙を閉じる。承認待ちでは保持しない。PC接続不能・期限切れ・同期失敗は停止。attester鍵・信頼経路・atomic protocolは未実装の本番移行条件である。

## 権限・秘密情報・operator

専用の非特権SSHユーザー＋root-owned固定wrapperを候補とする。限定sudoはそのwrapperの固定入口だけとし、引数は検証済みnonce等に限定。任意パス／argv／環境変数の実行を許さない。developが書換え可能な~/scriptへのNOPASSWD、広域sudo、Docker group、rootの汎用GitHubコメントhookは禁止。ユーザー・sudoers・SSHの実設定は別承認。

wrapper・trusted public key・spool・nonce journalはroot管理とし、所有権／mode／no-symlink／サイズ上限を確認して資材を検証領域へ移す。アップロードされたscriptをroot実行しない。SSHは専用鍵・必要ならForceCommand等で入口を限定し、認可済み固定image／commandだけを起動する。秘密鍵は運営者端末の保護された鍵保管／暗号化保管・hardware等を使う。平文パスワードや鍵をchat・GitHub・Git・ログへ置かない。VPS側のpublic-KG用資格情報はrootのみ読める600設定とallowlistで渡し、compose全設定や会員PG秘密情報を出力しない。

旧ops imageのORIGINAL_STORY不足は前回だけread-only mountで補った。恒久仕様にせず、対応Roleを組み込んだ正式ops imageを隔離build・validate・backup／plan・digest／linux-amd64確認後に別判断で採用する。旧imageのdigestを承認しただけではRole対応済みとは証明できない。Web／Compose／PG更新と混在させない。

## 次の運営者判断と検証範囲

現行の実post-publication backup取得と本番plan、対応済み正式ops image、root-owned wrapperと鍵trust／nonce journal、WSL attestation、専用ユーザー／限定sudo、署名承認の操作入口を別ゲートで判断する。日常操作は `prepare → 状態確認 → 固定候補への署名承認 → 信頼済み実行入口 → 検証・GitHub記録` とし、新サービス／有料AI定期起動を必要としない。

今回の試験は既存operatorをfake Docker／curlで動かすprocess試験、新同期CLIを実受入coreの隔離fixtureで検証、実Ed25519署名と状態復旧policyを検証する。全stage名を走査するsimulateは状態機械モデルであり本番adapterの障害注入試験ではない。今後のadapter導入時に、nonce競合／journal保存失敗／attestation期限切れ／apply応答喪失を含む実process結合試験が必要。

## PC停止・受入との協調（Issue #33 後続）

現行の停止/再開契約は [PUBLICATION_COORDINATION.md](PUBLICATION_COORDINATION.md)。既存Workerの無期限pause-newと実ACKを用い、公開側の不可逆閉鎖証明後だけresumeする。flock/短期challenge単独を本番運用しない。導入は [運営者手順](../runbooks/PUBLICATION_COORDINATION.md) の別承認に従う。
