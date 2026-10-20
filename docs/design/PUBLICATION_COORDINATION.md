# 公開と受入の停止・再開プロトコル（Issue #33）

2026-10-20。隔離実装の仕様。本番導入・公開の承認ではない。既存Worker本体・稼働runtime・時間帯・10分休憩は変更しない。実root/SSHへの導入は [運営者手順](../runbooks/PUBLICATION_COORDINATION.md) の別ゲート。

## 方式の比較と選択

| 方式 | PC停止・通信断時の安全性 | 実装量 | 日常運用 |
| --- | --- | --- | --- |
| 共通flockと短期challengeだけ | PC再起動でflockが消える。VPSの残存applyと再受入の競合を防げない | 小 | 採用しない |
| pause-newを投稿するだけ | 既に走っている受入・残存子process、未反映pause、遅れて再開する公開processを防げない | 小 | 採用しない |
| **無期限pause-new＋実state ACK＋両ロックによる静止確認＋VPS不可逆閉鎖＋条件付きresume** | PC停止後もGit/Worker stateにpauseが残る。Worker再起動時のGit取得失敗は処理開始前に停止。旧公開を閉じた証明がなければresumeしない | 既存Workerを再利用。周辺のticket/journal/CASを追加 | 公開待ち中は受入が止まる。復旧時は同nonceの位置から再開。新daemon不要 |
| VPS期限・世代fencing token | 正しく実装すればVPSを権威にできる。ただし期限切れだけでは、通信断中の旧Workerを失効させられない | 全受入保存境界へのオンラインepoch検査・ローカル書込との原子性・再起動時照会が必要。現Workerの変更が必要 | 常時VPS到達性・期限/更新・鍵/障害対応が必要 |

太字を採用する。ticketの世代番号は再送・旧証明を区別する識別子であり、期限付きleaseの実装を名乗らない。安全性の代償として無期限停止を選び、PC不在時の自動公開・自動resumeはしない。既存の承認内容に対する意味判断は加えない。

## 状態と不変条件

VPSのroot-owned `exclusion.json` は単一active ticketと単調増加generation、全nonceの履歴を保存する。ticketはnonce、UUID、Worker ID/code SHA、artifact SHA、receipt集合SHAに固定。`open → closed|cancelled → finished` の一方向。別nonceはfinishedまでarmできず、古いnonceを再openできない。TTLなし。状態ファイルの削除・巻き戻しは復旧手段ではない。

1. `arm` は資材をfreezeしてticketを永続化するだけ。公開権限を与えない。
2. WSL coordinatorが、明示された人間の運用判断から既存形式のpause-newを投稿する。独立Git cacheを用い、既存Workerのcache/stateは書かない。Git投稿より先にintentをfsync保存し、再起動時も同じcontrol ID/revision/bodyを使う。
3. 通常Workerがpauseを反映するまで待つ。既存処理は終了まで尊重する。公開peerはcoordinator専用lock→worker.lock→既存共通flockの順に**非blocking**取得する。途中で取れなければ取得済みlockを解放して戻る。lock fileを消さず、待機中に保持しない。
4. ロック内で最新Git制御履歴の全chainを既存ExecutionControl parserで検証し、実configのremote/branch/Worker ID/code SHAと実stateのpause ID/revision/raw hashを照合する。error/activeAttemptがあれば不可。GitHub statusだけ、PIDだけ、古いcacheだけでは証明にしない。通常Workerのpollを恒久停止する方式ではない。
5. peerは固定candidateと**現在の全正式receipt・本文・Role・scope・根拠・依存レコード**を既存freshnessで再検証する。短期challengeにticketとpause証明を加えてattester署名する。VPSは最初の往復後にロックを取り直してticketのopenを再検査する。承認確認後・nonce予約前にも再照合する。
6. VPSは従来の固定image・base/revision・実plan・追加のみ・公開承認・nonce/release予約を維持し、一度だけapplyする。PC/SSH断でローカルflockが消えてもdurable pauseが新受入を止める。
7. 完全DB/receipt/graph/API検証済みcompletedに限り `close` する。未予約なら `cancel` で不可逆に閉じられる。最初のpreflight前のcancelも実pause証明が必要だが、stale candidateのreceipt freshnessは不要。予約後の不明結果はcancel不可。close/cancelは署名済み閉鎖証明を返す前にfsyncする。
8. WSLは別pinのserver公開鍵で閉鎖証明のticket/世代/hash/元pauseを検証し、最新制御が**自分のpauseだけ**の場合に次revisionのresumeを投稿する。投稿直前の他制御はFF/CASで拒否し、任意の人間のpauseを解除しない。
9. `finish` はchallengeに対するattester署名で、対応する次revisionのresumeがGitに保存されたことを検証してactiveを解放する。resume投稿後にPCが落ちても旧ticketは閉じたままで、次の公開もfinishまで始まらない。Workerのresume ACK前でもfinish可能。次回公開は新pauseの実ACKと静止証明が必要。

公開承認待ちは両側共通ロックを解放し、永続pauseだけを残す。root共通lockはpreflight/apply/状態遷移中だけ。Workerの通常tickと短時間競合した場合は後で同操作を再試行し、強制終了や強制解放をしない。

## 障害時の再開位置

| 停止地点 | 保全と再開 |
| --- | --- |
| pause投稿前/直後、応答喪失 | ローカルintentとGitの同一controlを照合してpauseを再試行。新revisionを勝手に発行しない |
| pause未ACK、稼働処理/残存子がロック保持 | 公開開始不可。通常終了・次回pollを待つ。独立read-only作業は可能 |
| PC再起動・Git通信断 | 既存Worker tickはGit同期が成功するまで処理しない。成功しても無期限pauseを再読込。VPSは新しい署名証明なしに公開を開始しない |
| approval import/新receipt保存後に停止 | 承認の取込はpauseを解除しない。receipt集合が進めば旧candidate/承認は失効。未予約cancel後に新candidateへ |
| apply前の旧processが停止、cancel後に復活 | root共通lock内のopen再検査で拒否。閉鎖証明だけで公開を許さない |
| 予約/apply中にVPS/PC/SSH断 | pauseとnonce/release予約を保持。同nonce executeはverifyのみ。予約済み未適用に見えても自動再apply/cancel/resumeしない |
| DB commit後、receipt/検証/通知保存前に停止 | DBのmanifest/data/graph一致からverifyを再開。completed後close。通知はnotifyだけ |
| close直後PC停止 | 旧ticketは閉鎖、Workerはpause。閉鎖証明を再取得してresume |
| resume push直後PC停止 | 同じresumeを検出してfinish。同nonceのapplyは永久に拒否 |
| 他の運用制御/古いticket/不一致 | 自動処理停止。第三者pauseを消さず運営者に戻す |

## 信頼の前提と検証の範囲

既存の全受入は同じWorker/common lockとGit制御chainを守ること、制御branchがFF-onlyで履歴・承認を保護されることが前提。受入workflowの直叩き、別homeの無管理Worker、手動resume、rootによるjournal削除を防ぐOS/GitHub権限は導入時の信頼境界である。権限を持つ運営者によるプロトコル外の同時操作まで、この周辺コードだけでは防げない。

隔離試験は実Git bare remote、既存Worker tick/parser、実flock、PC/WSL役とVPS役の別process、実Ed25519を用いる。kill/再生成/通信失敗/receipt改変を注入する。公開DBはfake backendであり、実Windows再起動、実VPS電源断、実sshd/sudo/ネットワーク越しの導入試験ではない。ORIGINAL_STORY image/Neo4j実証は前段の検証記録を継承する。本変更でTS・image・Worker実装は変更しない。
