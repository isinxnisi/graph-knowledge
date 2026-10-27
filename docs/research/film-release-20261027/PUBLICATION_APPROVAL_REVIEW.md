> 2026-10-28更新：本番公開は完了しました。同nonceの公開署名・全件検証・排他finished・監査・条件付きresumeを確認済みです。以下の操作コマンドは当時の履歴であり再実行しません。[最新の公開完了・3200／beta整理記録](../../verification/FILM_INITIAL_PRODUCTION_20261028.md)。

# 映画初期公開：固定requestの個別本番公開承認

2026-10-28 JST。Role 2件・映画2 Claim＋依存3 Entity／2 Source／2 Citationは正式受入済み。運営者によるWSL／VPS operator pin更新も完了し、Codexが同じ固定候補のarm・通常Worker ACK・root実plan・既存delivery登録まで完了した。**本番Web切替・個別公開署名・本番KG applyはまだ行っていない。**

## 今回の公開対象

| Claim | 接続・根拠 |
| --- | --- |
| `4c88b8e8-154d-47ad-bf82-f19876ecaebd` | クリント・イーストウッド → 許されざる者、ACTING。AFI CASTの人物・劇中役の行。 |
| `34b41d23-f4e6-4fc6-aa6f-2905f3c2a890` | クリント・イーストウッド → ミリオンダラー・ベイビー、DIRECTING。AFI DIRECTORS／Dirの人物行。 |

scope／periodは承認票どおりnull。全版・全地域・全期間を宣言せず、公開年からperiodを補わない。正式receipt SHA `3ac7b6be38e24aa9dfd7bf67233b7c5e80822c4313ca9b58d34408611cdc83c3`。追加3/2/2/2と3 ExternalIdentifierだけで、既存更新0・追加12 node／11 relationship。

[正式受入本文](formal-acceptance/accepted-records.json)／[全11 receiptの候補台帳](publication-candidate/ledger.json)／[Astra未収録分](ASTRA_RESEARCH_BACKLOG.md)。今回の2件を81記録・97 Entity候補全体の収録と扱わない。未受入79記録・94 Entity候補を後続へ維持する。

## rootで確定した署名対象

[実request](publication-live/live-request.json)／[root status](publication-live/root-status.json)／[追加planの署名hash一致投影](publication-live/live-plan-projection.json)。

| binding | 固定値 |
| --- | --- |
| nonce | `6b240b18-56e4-4ea4-995f-7be7424c3fb2` |
| release | `publication-film-initial-20261027` |
| base release | `manga-issue-34-obata-drawing-20261023` |
| base revision | `b74a4b00-9454-412f-af5d-1317713a543c` |
| artifact SHA | `055bcacb42dfe5b7c3b32cb17fece1b8748a1900fb5c7618c4faa61ffa9894d7` |
| receiptSet SHA | `614a0f3ccff3854280012767f580a99427c94f72bd846a920e4dc1ed91d57ffd` |
| **root live plan SHA** | `16dc070797315903397389d071b4a118acdbbb5a1cdd5dd0a0f6677503d95ebc` |
| operator digest | `sha256:7042781b105067ce3adea0c59bccfb4c8326f84c0ca6aa5f1b8c26e6cd3d5cef` |

旧offline plan SHA `1c8075dd…` は署名対象ではない。rootは新operatorでimage／validate／本番backup／追加のみ実planを実行し、既存peerが全11 receiptと意味・Role・scope・根拠を再照合した。上記plan投影は候補の追加ID／更新0／関係追加を並べ直したもので、そのcanonical SHAが実root requestと一致することを確認している。rootの内部plan fileを読んだという記録ではない。

既存の承認待ちcurrent.jsonも今回のWeb先行コマンドへ向け、[Web前提の追記](publication-live/web-prerequisite-notice.json)を追加した。元のimmutable request／汎用READMEは保持している。

root状態はawaiting-publication-approval、exclusion=open。Workerは通常tickでpause-newをACK（revision5、activeAttemptなし）。既存の公開協調契約による一時pauseで、設定・収集承認・Workerコードは変えていない。公開・署名閉鎖・条件付きresume／finishまでこのpauseを保持する。予約・journalを削除して再開しない。

## 一つの運営者操作枠

本番Webは現在旧8 Role対応（build `p2mPLpwWtvRzE54EdYqwS`）のため、KG公開より先に正式10 Role・段別検索に対応するWebへ切り替える。準備済みWebはsource `4eee46a0…`、build `oTXBAgU034CoviTmmAHQ9`、VPS image `sha256:afaa4a8203e757f5a604c08653a83f4944856717d1cafc45af3be8c1d000e65d`。現在mainとDocker入力のbytesが一致する。

[隔離した実Web imageのブラウザ検証](web-image-private-test.json)では、正式受入データを独立KGへ置き、段別検索→AFI根拠→Graph→保存・reload復元、逆順不一致、試験表示なしを確認した。独立PGへ既存000〜010を適用して匿名境界を検証した。実Googleログインや本番DBへの接続を成功と数えない。試験container／networkは撤去済み。Web用の初期AI artifact SHAは従来の `5e547936…` のままで、betaの実推論artifactを公開しない。

[Web切替資材と固定hash](web-publication-deployment.json)／[資材SHA](web-publication-SHA256SUMS)。120,135,028 bytesのimageを実検証し、WSL private directory／VPS develop stagingで全SHA一致。rootでの実行は未実施。

次の[一度限りの操作入口](../../../ops/run-film-publication-step.py)は、順に以下を行う。

1. VPS sudoで、固定資材をroot-privateへコピー・SHA照合。現在のWeb／KG／公開requestを確認し、Webを短時間停止して会員DBの29テーブル指紋・custom dumpと設定・KG backupをprivateに保存する。Web imageだけを更新し、既存env・全他Compose設定・Google／会員機能・11 migration・全会員行・DB container・KG全内容・初期AI artifactの保持を検証する。失敗時はWeb設定だけを戻し、DBをrestoreしない。新Role検索APIが200・映画はまだ未公開0件であることを確認する。
2. WSL sudoで、今回一時無効化した既存preparationをtrueへ戻す。source7392d8e…／nodeImage2bf646a2…／他設定を保持し、このnonceの登録済みrequest・全11 receipt・未署名を再照合する。OS lockは確認入力前に解放する。
3. **既存の保護されたapprover**が上記固定requestを表示し、運営者へrelease IDの確認入力を求める。承認する場合だけ `publication-film-initial-20261027` を入力する。この入力後は30分の個別署名が作られ、既存deliveryによる本番KG apply・全件verify・通知・署名閉鎖・自分のpauseだけ条件付きresume／finishへ進む。

以前のRole／Claim受入承認やoperator pin更新で、この個別署名を承認済みと扱っていない。以下は**本番公開署名と実行を含む操作**であり、Codexは実行せずここで運営者へ渡す。

```bash
(
set -eu
cd /home/isinxnisi/1.projects/7.graph-knowledge
printf '%s  %s\n' \
  fb9f474dca38eb168bfddc4c12b147e91918af7af7693ce181255450327ef0b7 \
  ops/run-film-publication-step.py | sha256sum -c -
python3 ops/run-film-publication-step.py
)
```

成功時はVPSのweb-result（新build、memberTablesUnchanged=29、migrationCountUnchanged=11、environmentUnchanged=true、publicApply=false）が出た後、WSLの固定requestとrelease確認入力が表示される。署名後の配送結果と併せて出力をCodexへ返す。エラーや結果不明は同nonce・backup・journalを保全し、コマンドの再実行／再署名・別nonce・自動restoreは行わずCodexが状態を確認する。

Codexは結果を確認し、必要なら同nonceの既存配送／verify-onlyを継続する。公開後はplunode.net実ブラウザの映画検索・根拠・Graph・保存復元、漫画／会員機能とKG旧record保持を確認し、betaの旧trial projectionを正式receiptに一致する確認用projectionへ整理する。この時点ではその公開後作業を完了扱いにしない。

## 現在の環境

main／専用branchへ操作資材を統合する。3200／HTTPS betaは既存build `vBqJY67wdqijTKKY-EMJL` と旧trial projectionを維持し、今回Webコードを変えていないため不要な再buildはしない。本番Webは上記旧build、KGは上記base revisionのまま。root operatorだけが正式Role入りへ更新済みで、署名・予約・本番applyは未実施。
