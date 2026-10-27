# 映画34 Claim：個別本番公開承認待ち

2026-10-28。承認済みWorker5ファイル更新、映画34 Claimと29/5/34の正式受入、release準備、offline plan、VPSへの候補転送、通常Worker ACK、root実plan、既存delivery登録まで完了した。**本番公開署名・本番KG apply・beta／本番Web切替は未実施。**

受入は [実人間判断](claim-decision-approved.json)／[正式receipt](formal-acceptance/acceptance.json)、対象34件は [人物・作品・Role・原表記・根拠の一覧](CANDIDATE_REVIEW.md)。受入時の意味・UUID・scope・periodを変更していない。公開候補の追加集合は今回の29 Entity／34 Claim／5 Source／34 Citationだけで、既存全recordの更新は0。初回公開済み2 Claimを再公開しない。

## 固定された署名対象

[root request](publication-live/live-request.json)／[root status](publication-live/root-status.json)／[登録済みjob](publication-live/registered-job.json)／[既存operatorのdescribe結果](publication-live/operator-description.json)。

| binding | 固定値 |
| --- | --- |
| nonce | `13abfb93-ba2d-44f7-a56b-352aa7ab0ab0` |
| release | `publication-8b0b1d67656a15c7e505ba1f` |
| base release | `publication-film-initial-20261027` |
| base revision | `7c54da24-6fa9-46a5-810d-834eed8328d9` |
| artifact SHA | `9a58b3a3515c4e8fb4093a76210acc4828a8cfefc68b1dbba135b019ee41d2da` |
| 全12 receipt集合 SHA | `9cfd5c4f9a84d6f37ac6a58228421d76d1859d0f7e48b117b424c42495af1969` |
| **root実plan SHA** | `8e6dbf83d411acef77c2631c1dde6a466f2b8fb7a45e742371334560416ee5e7` |
| operator digest | `sha256:7042781b105067ce3adea0c59bccfb4c8326f84c0ca6aa5f1b8c26e6cd3d5cef` |

追加131 node／165 relationship、既存更新0。[plan投影](publication-live/live-plan-projection.json)のcanonical SHAがroot requestと一致する。投影は確認済みoffline差分から再構成したもので、rootのprivate plan fileを読んだものではない。offline plan SHA `7f210120…` は署名対象に使わない。

rootは `awaiting-publication-approval`、exclusionはopen。Workerは既存制御revision7のpause-newをACKし、activeAttemptなし。Worker ID／base pin973／collector実行hash／既存38依頼・承認／旧11 receipt／coordinator・peer設定を保持した。新規収集開始は公開排他のため一時停止中で、署名・公開・検証・閉鎖後に既存契約の条件付きresume／finishへ進む。手動でpauseを外さない。

## 次に必要な運営者操作は一つ

**以下は新たな本番公開署名と本番KG applyを含む操作。今回Codexは実行していない。** 保護されたapprover秘密鍵はroot専用のため、既存署名契約に従い運営者のsudoとTTY確認が必要になる。Worker更新・正式受入への今回の承認では、この署名を代用しない。

WSLで次を実行する。現在のdirectoryに依存しない。

~~~bash
sudo /usr/local/sbin/plunode-publication-approve \
  --nonce 13abfb93-ba2d-44f7-a56b-352aa7ab0ab0 \
  --minutes 30 --operator-approved
~~~

表示されるrequestが上表と一致することを確認し、公開する場合だけ次のrelease IDを入力する。

~~~text
publication-8b0b1d67656a15c7e505ba1f
~~~

入力後、既存deliveryが同nonceで署名・本番KG apply・全件検証・結果記録・署名閉鎖・自分のpauseだけ条件付きresume／finishへ進む。Web切替や会員DB変更は含まない。成功時のJSONをCodexへ返せば、新revision・receipt・排他finishedと本番／betaの読取確認へ進める。

エラーや結果不明の場合は、同nonce・journal・backupを保全する。別nonceへの切替、再署名、lock削除、強制resume、DB restoreは行わず、既存status／同nonceのverify-only手順で確認する。

## 準備時の停止と再開

初回の自動preflightは理由を秘匿する既存wrapperで停止した。初回の内部原因は未確定。診断時にroot所有configをpeerへ直接渡した試行も、所有者検査で安全に拒否された。その後、既存のuser所有peer configを用い、固定コードを変えず同nonceのpreflightを再実行して成功した。通常のqueue経路で登録・公開承認待ち案内まで完了。gate・clock・署名条件を緩和していない。

新規公開承認ファイルは存在せず、本番revisionは引き続き7c54da24…。main、3200、beta、本番Web、会員DBは変更していない。未受入45記録・65 Entity候補と構造化37／保留6は [最新全件台帳](RESEARCH_COVERAGE_CURRENT.json)へ維持し、この34件で研究全体を収録完了にしていない。
