# Issue #33 第2段階：固定公開ゲート候補の隔離検証

2026-10-20 JST。[実装・導入計画と未実装境界](../runbooks/PUBLICATION_GATE_INSTALLATION.md)、[JSON証跡](PUBLICATION_GATE_20261020.json)。開始点03e8ef6、独立managed worktreeで実装し、共有mainへの反映だけ共通排他を使用する。既存Worker／Autopilot／収集承認／検索UI／会員DBを変更していない。本番VPSへのSSH・sudo・配置・apply／restoreは実施していない。

## 完了した実装

- 固定wrapper、forced SSH command候補と公開アダプター。trusted program以外を起動せず、uploadはFD単位でno-followコピーしてhash検証する。実root版は固定path・所有権／mode・環境初期化、非root sandbox版は擬似root境界を使う。
- 前段のcycle／policyを再利用し、freeze→新しい実preflight request→人のEd25519署名→再preflight／freshness→durable nonce／release予約→唯一のapply→全graph／receipt／API確認→監査outboxを実装。
- expectedRevisionと追加のみのguardを既存applyへ任意引数で追加。従来callerの挙動は維持。schema操作前のreadと、DBのwrite transaction内で再検査する。原作Role・検索モデルを変更していない。
- WSL receipt peerの試作。既存共通flockをremote終了まで保持し、root発行の二回の60秒challengeへ元receipt・本文・Role／scope・根拠と公開差分を検証して署名する。runtimeの可変programは実行しない。
- nonceとreleaseの予約をfile／directory fsyncで保存してからapplyingを保存する。予約後の失敗や結果不明は再applyせず、DatasetReleaseのmanifest digest／data hashと全graphを照合してverifyだけ再開。別nonce・同releaseで迂回しない。
- GitHub通知は別の非特権主体による固定Issueへのoutbox送信。失敗時はnotifyだけ再試行し、DB・受入・applyを再実行しない。markerで送信重複を抑制する。

## テスト

| 検証 | 結果 |
| --- | --- |
| `python3 -m unittest discover -s tests -p 'test_publication_*.py'` | 83件成功（新executor 22件＋既存61件） |
| `python3 -m unittest discover -s tests -p 'test_collection_sequence.py'` | 19件成功 |
| `node node_modules/vitest/vitest.mjs run tests/public.test.ts --no-file-parallelism` | 13件成功 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 成功 |
| ORIGINAL_STORY ops image build＋private Neo4j | 成功。下記 |

合計115テスト。新executor試験は実Python子process・Ed25519・OS flock・fsync／rename・擬似DB processを使う。単なるstage列のsimulateには依存しない。重複nonce／二重並行実行、期限切れ、artifactへの承認再束縛、file／directory fsync失敗、署名／challenge不一致、通信EOF、Worker／VPSロック競合、program mode／hash・資材・symlink／hardlink改変、base drift・既存更新・validate／backup／plan／image失敗を再現した。全事前失敗でapply呼出し0を確認。

apply前の不明失敗、commit後の応答喪失、**DB commit後にgate processを強制終了する隔離試験**、後検証失敗、DB receipt不一致、監査送信失敗も再現。commit確認できる場合だけverifyへ進み、applyを再呼出ししない。未確定releaseは別nonceのpreflightも拒否。実WSL peerと実gate子processを接続し、元receipt照合と共通lock保持・解放を確認した。root wrapperの非root実行／任意argvとSSH shell注入を拒否した。実rootへの昇格試験は行っていない。

managed worktreeのWindows checkout改行変換により既存凍結hash／shell検査が一度失敗した。worktree内の未変更ファイルだけをGit blobの元バイトへ戻して解消し、最終試験はすべて成功。共有リポジトリの原本・旧凍結成果に変更はない。

## 正式ops image候補

`ops/Dockerfile.publication` と専用build allowlistを追加した。既存Web build／Compose／member migrationを含めず、現行Role実装と既存公開CLI、guard付きruntime helperをimageへ含める。暫定contribution.ts mountは使わない。

最終config IDは **`sha256:af1216c98ef75ad0fdba1424d854fc26802af066f684c77af79f9bf6f6cf880f`**、linux/amd64。公開Role capabilityでORIGINAL_STORYとguardedApplyを確認した。

```bash
docker build -f ops/Dockerfile.publication -t graph-knowledge-publication:issue33-candidate .
python3 scripts/test-publication-image.py \
  --image '検証する固定image ID' \
  --public-fixture '既存公開bundle/release/data.json' \
  --output '/新規の隔離検証結果.json'
```

runnerは固有名のinternal Docker network、公開ポートなし・tmpfsの一時Neo4jだけを作る。既存公開fixtureのAUTHORSHIP／ORIGINAL_STORY 2 Claimを依存付きで切り出し、隔離DBを1 Claimでbootstrap、1 Claim追加のvalidate／plan／guarded apply／全graph・DB receipt確認を実行した。結果は既存更新0、追加7 node／6 edge、最終4 Entity／2 Claim／2 Source／2 Citation／4 ExternalIdentifier、release receipt 2件。古いrevisionのapplyと重複applyを拒否し、revision不変を確認。自分が生成したcontainer／networkを終了時に削除した。

**本番applyは0回。** 上記2回のapplyは新規private DBへのbootstrapと追加である。既存ローカルKG／VPS／会員DBへ接続していない。imageはlocal候補であり、本番配布・正式採用・既存image更新は行っていない。

## 現状態と保全

前段のprepareを改めてread-only実行した。現在release `manga-issue-25-utc-recovery-08-normal`、revision `88437056-b74f-42ab-88c0-33ed435bdccc`、正式受入済み公開50 Claim（66 Entity／43 Source／51 Citation）、未公開は全型0。`up-to-date / candidateCreated:false / productionExecutionEnabled:false`。既公開50 Claimを新候補にしていない。元9 receipt集合SHAは `b9718eb62c705b360852fab0b6adbbac932cbff094656ad96879ff2018a101f1`。

Workerの移行済み不変999ファイルとコード248ファイルを移行時hashへ再照合し相違0、activeAttempt=null／pauseMode=null。Workerコード・制御・時間帯・10分休憩・cache・正式receiptを変更していない。共有mainの既存memoも維持した。

## 本番導入の残条件

コード候補と隔離試験の完了を、本番信頼経路の導入済みと扱わない。実root所有／sudoers／sshd、鍵保管・pin・rotation、imageの安全な配布、public-only資格情報とDB／network／loopback API、audit主体、最新実preflightを別途レビュー・承認する。[導入計画](../runbooks/PUBLICATION_GATE_INSTALLATION.md)に固定path／mode／最小sudoers・鍵と運営者操作を具体化した。

特に**WSL突然停止・network partition後の厳密な分散fencingは未実装**。接続中のflockと短期challengeの試作を検証した範囲であり、再起動したWorkerが未確定VPS applyと照合して新受入を禁止する連動は今回変更していない。この条件を解決・検証するまでproduction設定はdisabledのままにする。hardware／暗号化signer連携、実root boundaryの故障注入・独立security reviewも未了。公開後異常を自動restore／再applyで解消しない。
