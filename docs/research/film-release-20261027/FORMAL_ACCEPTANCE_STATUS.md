# 映画2 Claimの正式受入完了と進行履歴

2026-10-28の現在地：operator pin更新・通常Worker ACK・root実plan・既存delivery登録は完了。次の人間操作は[固定requestに対するWeb切替・個別本番公開署名](PUBLICATION_APPROVAL_REVIEW.md)。以下のpin更新／ロック競合時のコマンドは実行済み履歴で、再実行しない。

2026-10-27。固定受入票 `6bdc6af8165719975b57bb132c0188a18f18712fecf0cf1a93945b794a3747b6` への運営者の実発言（22:17:32 JST）を記録し、既存accept-filmの共通hold・worker.lock・正常非pause・固定hash・全receipt検査を通して正式受入した。本番公開署名・applyは含まない。

- [実人間判断](claim-decision-approved.json) SHA `edd3552a7c2b87d391c68a0f0cf9b46bc7a9f9bd409ec9aaf270d959c10b2df3`／[承認の出所](claim-approval-provenance.json)。
- [実正式receipt](formal-acceptance/acceptance.json) SHA `3ac7b6be38e24aa9dfd7bf67233b7c5e80822c4313ca9b58d34408611cdc83c3`。記録時刻2026-10-27T14:02:50.291684+00:00、sourceReviewKind=film-discovery-v1、status=accepted-for-release-preparation-only。
- 追加3 Entity／2 Claim／2 Source／2 Citation、scope／periodはnullのまま。UUID・AFI原表記・根拠・限定を承認票から変更していない。`film-initial-20261027` のrelease準備・validate・完全本番backupとのoffline plan成功。旧10 receiptの計65ファイルのbytes不変、正式receiptは合計11件。
- [固定公開候補](publication-candidate.json)：nonce `6b240b18-56e4-4ea4-995f-7be7424c3fb2`、release `publication-film-initial-20261027`、既存更新0。3 ExternalIdentifierを含む追加12 node／11 relationship。[候補validate](publication-candidate/validation.json)はEntity2178／Claim1897／Source1797／Citation1934。正式受入releaseとは別IDで、後続の公開済みbase同期時に不変manifestを衝突させない。
- artifact SHA `055bcacb42dfe5b7c3b32cb17fece1b8748a1900fb5c7618c4faa61ffa9894d7`、receiptSet SHA `614a0f3ccff3854280012767f580a99427c94f72bd846a920e4dc1ed91d57ffd`。plan SHA `1c8075dd8f57800ef73c929f8d567e12464918e9104cdf22df3bbbfb216004d8` は **offline候補plan**。rootの最新実plan／登録requestはまだ存在せず、個別署名の対象として先取りしない。
- 全研究の収録完了ではない。[Astra未収録分](ASTRA_RESEARCH_BACKLOG.md)／[全候補対応台帳](ASTRA_RESEARCH_COVERAGE.json)。照合済み81記録中79記録、97 Entity候補中94候補は今回の受入範囲外。全124候補のうち残る122件の研究状態を保持した。

## 今回だけの候補準備

既存Issue #33 source `7392d8e343a11644b1047364c71653779ad0c93c` のreceipt inventory／builder／DockerNode／artifact検査を再利用した。新しい公開自動化・署名機構は開発していない。初回試行では未mountの一時directory、次の試行では新規Entity等のJSONキー順でvalidateが停止した。失敗した未arm候補2件は保全し、receipt・正式releaseを書き換えていない。

成功試行ではTMPDIRを既存preparation home内へ限定し、既存fixtureV4Schemaでキー順だけを直列化した。全JSON値の完全一致を要求し、正式Role入りの実operator imageでvalidate／追加のみoffline planを再確認した。gateのchecksum・承認・read-only mount・ネットワーク分離を維持した。[後続Issue #53](https://github.com/isinxnisi/graph-knowledge/issues/53)へoperator継承・一時mount・直列化の課題を追記済み。

## 固定operator image pin更新（完了履歴）

既存の保護されたroot trust／delivery設定を変更するため、WSLとVPSのsudoは運営者が実行する。[既存gate設置契約](../../runbooks/PUBLICATION_GATE_INSTALLATION.md)に従う。**公開署名・apply・Web切替はしない**。

Codexは240,074,408 bytesの実image archiveを検証し、WSL private directoryとVPS `/home/develop/film-operator-20261027` へ配置・全SHA検証済み。模擬承認を含まず、正式catalog／reviewsを使う。config IDは `sha256:2bf646a22e867e5aa5fce5a155db45c337c4134ad6c0f337b65617c5799912e9`、VPS用manifest IDは `sha256:7042781b105067ce3adea0c59bccfb4c8326f84c0ca6aa5f1b8c26e6cd3d5cef`。archive SHAは `b97f37d4b9129f3598c3d687a9155173534fec3801004fe57c32ffbdd0a0d9f1`。

[操作入口](../../../ops/run-film-operator-image-step.py)はWSL→VPSの順に2回のsudoを要求する。固定資材をroot専用directoryへコピーし、SHA256SUMS自体の固定hashと全ファイルhashを照合してから、[一度限りのpin更新](../../../ops/film-publication-image-update.py)を実行する。[固定対象](operator-update-deployment.json)／[資材SHA](operator-update-SHA256SUMS)。root gateコード・署名鍵・他の設定・journal・reservation・会員DB・漫画Workerを維持する。VPSでは更新後に実KGの読取だけを行う。

WSL端末で次を実行する。失敗時はroot作業directoryを消さず、出力をCodexへ返す。成功済み段階へ同じ操作を盲目的に繰り返さない。

```bash
(
set -eu
cd /home/isinxnisi/1.projects/7.graph-knowledge
printf '%s  %s\n' \
  9d64f68fbdde9a99303b91b4e42dfae33cacede68f2343255fd99fa351889a2c \
  ops/run-film-operator-image-step.py | sha256sum -c -
python3 ops/run-film-operator-image-step.py --resume-wsl-staged
)
```

2026-10-27の初回sudo操作は、別作業が保持中の共通ロックでBlockingIOErrorとなり、WSLの設定更新前に停止した。Codexがdelivery設定のSHAを元の8b03ee69…と照合し、未更新を確認。VPS段階は未実行。別作業の正常終了・ロック解放を確認済み。

上記はこの停止後の**再開コマンド**。既存root資材の固定hashを再検査し、未変更設定・更新前backupなし・完了resultなしを条件に再開する。root資材を消す／上書きコピーする操作はない。共通／preparationロックの競合だけは、更新が一切始まっていない場合に最大90秒待つ。他のエラーや更新開始後の失敗は再試行しない。固定root更新プログラム・image・trust manifest・SHA256SUMSは変更していない。新しい公開自動化・署名機構ではなく、今回のoperator操作入口だけの再開対応。

成功時に表示される2 JSONの確認点：

- WSL：target=wsl、nodeImage=2bf646a2…、deliveryEnabled=true、sourceCommitUnchanged=7392d8e…、newPreparationEnabled=false、signed=false、publicApply=false。自動準備だけを候補登録まで一時無効化し、既存signed-job配送とWindows taskを維持する。前回requestから旧operatorを継承させないための処置で、漫画Workerのpause／設定変更ではない。
- VPS：target=vps、operatorDigest=7042781b…、revision=`b74a4b00-9454-412f-af5d-1317713a543c`、graphDigest=`509b460f9fc56e414677d5cf4f1a25634ab48171810ac27413461db2914f3da4`、protectedTrustAndJournalsUnchanged=true、gateCodeChanged=false、signed=false、publicApply=false。

Codexは出力と実環境を確認後、同じ候補を既存arm／Worker pause ACK／root live preflight／delivery登録へ進める。その実plan／requestを確定してから、次の運営者枠で個別本番公開署名と必要な自動準備再有効化を提示する。現在のClaim受入承認で代用しない。公開後のWeb・本番ブラウザ確認・beta正式projection整理まで引き続きCodexが管理する。

## 環境状態

今回の変更は正式受入台帳・候補資材・記録・一度限りのpin操作資材。Webコード／DBは変更していない。3200／HTTPS betaは検証済みbuild `vBqJY67wdqijTKKY-EMJL` と旧trial projectionを維持。本番Web／KGは未変更、上記revisionのまま。beta試験projectionを正式receiptデータへ見せかけず、公開完了後の切替で整理する。
