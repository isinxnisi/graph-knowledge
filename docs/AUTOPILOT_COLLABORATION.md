# 自動開発の確認・排他・受け入れ

2026-10-07採用。自動開発の変更を検知し、予定時刻と手動作業の競合を防ぐための開発運用。サービスのDB/API/UIや探索契約は変更しない。

## 原則

自動開発は専用worktreeへcommitする。mainへの取り込みは別のレビューと受け入れで行う。自動開発の終了・テスト成功・未反映commitの存在を、人間の受け入れと扱わない。次の作業は各自動実行が判断するため、受け入れ待ちで必ず停止するわけではない。

Windowsの予定を止めたり元に戻したりする代わりに、既存runnerと同じ `~/.local/share/graph-autopilot/autopilot.lock` の `flock` で排他する。ファイルの存在やPIDだけではなく、OSが保持するロックを使用する。ロックファイルは削除・置換しない。runnerを変更する必要はない。

## 確認

```bash
make autopilot-review
make autopilot-status
# 機械読み取り用
python3 scripts/autopilot.py review --json
```

reviewは一時的に共通ロックを取得し、手動側HEAD、受入候補の固定SHA、共通祖先、未反映commit、手動側のみのcommit、差分概要、双方のdirty・Git操作途中を確認する。専用branch／Gitルート／共通Git管理領域が設定と一致しない場合は拒否する。実行中なら取得できず終了コード75を返す。Windows状態取得に依存せず、ローカルの排他を基準にする。

開発実行のログは `BEGIN: mode=--run` を持つものから直近5件を探す。新しいcheck／smokeのログで開発結果を上書きしない。直近の開発試行と、候補SHAに対応した正常終了ログは別に示す。skip、失敗、終了記録の欠落も確認できる。summaryは実行側の自己報告であり、検証内容の監査や品質保証ではない。該当ログが直近5件にない場合は「確認できない」と表示する。

未反映commitは手動側HEADから到達不能な自動側commitとして検出する。mergeで取り込めば自然に消える。cherry-pick／squashでは元commitの祖先関係が残らないため、同じ内容でも候補として表示され得る。初期運用では固定SHAの通常mergeを使う。独立した受入済みフラグは設けない。

## 手動作業を始める

```bash
# terminal A（このプロセスを終了させず保持）
make autopilot-hold
# 長い作業は最初から時間を指定できる（1〜120分）
python3 scripts/autopilot.py hold --minutes 120
```

取得時にtokenを表示する。別terminalまたはCodexの別コマンドで、保持と固定SHAを再確認する。

```bash
# terminal B。TOKENは自分のholdが表示した値
python3 scripts/autopilot.py assert-held --token TOKEN
python3 scripts/autopilot.py review --token TOKEN
```

holdは既定60分で解放する。期限切れ、terminal終了、プロセス終了時にはOSロックが解放される。`manual-session.json` は所有者の確認用であり、残存していてもロック保持を意味しない。token不一致、保持プロセス不在、ロック失効はassert-heldが拒否する。長い作業の区切り、変更／検証／commit／取り込み前に再確認し、失効したら再取得してHEAD・dirty・ログを読み直す。

Codexの実行例は `exec_command({cmd: "make autopilot-hold", tty: true, yield_time_ms: 1000})`。返却されたsession IDを保持し、最後に `write_stdin` で `"\n"` を送って解放する。手動作業の終了や中断時は解放まで行う。期間が足りなくなっても、ロックなしで作業を続けない。

ロック使用中の場合は変更を開始しない。実行中作業を止めず、読み取りのみの別作業を行い、終了後に再確認する。スケジュールが手動作業中に発火すると、runnerは排他でskipする。これは正常なskipで、開発やテストが成功したという意味ではない。取りこぼした回を即時再実行する機能はなく、解放後は次の予定で実行する。

## 単一コマンドを保護する

```bash
python3 scripts/autopilot.py guard -- git diff --check
```

guardはロックを取得してからコマンドを実行し、元の終了コードを返す。ロックを取れなければコマンドを実行しない。子プロセスもロックFDを保持し、ラッパー終了による早期解放を防ぐ。有限時間で終わるforegroundコマンドを対象とする。バックグラウンドserverを残す使い方はしない。holdでセッション全体を保護している間にguardを重ねると自己競合するので、普通のコマンドを使う。

## 受け入れ

1. reviewで候補SHAを固定する。予定実行中なら終わってから固定する。
2. holdを取得し、候補SHA、手動側HEAD、双方のdirty／Git操作途中を再確認する。
3. 固定SHAまでの変更・契約・ログをレビューし、変更に応じた検証を行う。実DBを使った試験・seed・Web serverも共通ロック内で行う。
4. 受け入れ指示がある場合だけ、固定SHAを通常mergeする。最新のbranch名を対象にした無条件merge、レビューを省略した自動acceptはしない。dirty／Git操作途中なら先に内容を整理する。
5. 取り込み後の検証・commit・未反映確認を行い、`make autopilot-reports` でスマホ向け記録を整理してからholdを解放する。自動側はそのbranchを継続し、mainへの自動同期・rebaseは行わない。

この仕組みは通知を会話へ注入するものではない。AGENTS.mdにより、このCodexが作業を開始した時に検知する。常駐通知や多段履歴、受け入れ管理画面は追加していない。

## Driveの実行記録

Driveの記録はスケジュールや開発処理の入力ではなく、スマホで変更内容を確認するための出力。ローカルのログ・summary・reportsは原記録として保持する。受入済み記録をDriveの `アーカイブ` へ移しても予定実行に影響しない。

`make autopilot-reports` は確定済みmainのSHAを取得し、各成功実行の終了HEADがその祖先である場合だけ受入済みとして整理する。未受入・停止／失敗はルートに残し、スキップ・commitなしは通常履歴としてアーカイブする。commit前のmerge途中は受入扱いにしない。cherry-pick／squashは元commitの祖先関係が残らないので自動的に受入済みとは判定できない。

`最近の変更.txt` は未受入・要確認だけを最新10回まで表示し、`受け入れ状況.txt` は現在件数を短く示す。件数は実行記録数であり、未反映commit数とは別。次の予定実行の報告時にも更新するため、受入済み記録が再出現しない。出力専用ロックで手動整理と実行後出力を排他し、利用者の別ファイルを動かさない。同期失敗は開発・受入結果を変えず、原記録を残す。

2026-10-08：実Gitを使った報告・アーカイブの15件と、既存の確認／排他13件が成功。実際のDrive同期先でも成功記録3回のうち受入済み2回を移動し、未受入1回を残すことを確認した。今回、新しい自動開発commitの受入は行わない。

## 自動開発の方向と利用量上限

[現在の進め方](AUTOPILOT_DIRECTION.md)をrunnerがmainから読み取り専用でpromptへ加える。体験を試せる実装へ進む裁量を維持し、毎回の価値立証や全archive調査を要求しない。既存policyと短い6行報告は維持する。

Codexが非ゼロ終了し、末尾に明示的な利用量上限エラーを出した場合だけ、そのJST日を記録し、以後の当日実行は開始前にスキップする。最初の停止は失敗として残し、途中変更を消さない。翌日は再確認を許可するが上限解除の保証ではない。dirtyが残れば従来どおり手動整理が必要。一般エラー・timeoutで当日休止を誤設定せず、モデル・認証・購入・有料APIを変更しない。Driveの受け入れ状況にも当日休止を表示する。

2026-10-08 12時の実ログから休止を初期化。CLIは10月14日の再試行を案内しているが、表示時刻のtimezoneを推測せず、毎日の小さい再確認を基本にする。予定そのものは有効のまま。復旧作業では未コミットの表示操作を検証・commitし、履歴を捨てず整理した。

## 複数回にまたがる開発の引き継ぎ

45分は一回の実行上限。runnerは専用worktreeの `docs/AUTOPILOT_HANDOFF.md` があれば次回開発promptへ本文を加え、なければ作業を選ぶ。メモは状態・目標・実装済み・検証済み／未検証・次の一手・判断を通常25行以内で持ち、実装と同じcommitに含める。固定の実装計画や過去の会話ではなく、一件だけ更新する作業状態。main側に空のメモは作らない。

次回は現HEAD・コード・mainの方向と照合し、継続中の有用な作業を優先する。完了・保留・古い指示なら短く更新する。段階commitを機能完成／人間受入と扱わず、既存動作を維持して段階を検証する。スマホの6行報告は増やさず、未完成なら「残り」に次を示す。

runnerの全体deadlineから締め作業開始時刻を計算してpromptへ渡す。通常45分では強制終了前の5分を確保し、短い試験実行では上限の20%へ縮める。preflight時間も含む絶対時刻であり、Codex開始からさらに45分とはしない。時刻を見て作業を区切ることはagentへの指示であり、timerによる安全なcommitや自動復旧の保証ではない。

強制終了・利用量上限・失敗でdirtyが残れば従来の検査で止める。runnerが勝手にcommit・reset・stash・再開せず、人が整理する。メモはAIが書いた自己報告なので、受け入れ時は実差分と検証を確認する。Driveは引き継ぎの入力には使わない。

## 手動セッションの完了通知音

このPCのユーザー設定 `~/.codex/config.toml` のトップレベル `notify` に、`["python3", "/home/isinxnisi/1.projects/7.graph-knowledge/scripts/notify-complete.py"]` を設定する。Codexの `agent-turn-complete` 通知で、このmain worktree内をcwdとする手動セッションだけWindowsの短いチャイムを2回再生する。別worktreeの定期開発や別プロジェクトは対象外。追加のAI処理・ネットワーク・会話内容の保存は行わない。

設定の反映は次に起動するCodexセッションで確認する。既存セッションでの再読込やクライアントごとの通知発火を保証しない。フックが利用できない手動セッションでは、最後に `make completion-sound` で同じ音を鳴らせる。通知は応答完了を示し、全テスト成功やmainへの受入を音だけで保証するものではない。

音はWindowsの現在の出力先・音量を使う。ミュートを解除したり音量を変更したりしない。試聴は `make completion-sound`、停止はユーザー設定から当該 `notify` 行を外す。再生失敗は警告だけとし、完了した作業の結果を変えない。

公式の通知契約：[Advanced Configuration](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications)。プロジェクト内 `.codex/config.toml` では `notify` が無視されるため、マシンのユーザー設定へ置く。

2026-10-07検証：mainの完了だけ発火し、定期開発worktree・別project・完了以外・不正payloadでは発火しないこと、通知失敗が作業結果へ影響しないことを再生処理のmockで確認。`codex features list` による設定読込と `make completion-sound` のWindows実再生コマンド成功を確認した。実際に聞こえるかは出力先・ミュート状態に依存する。通知フックからの発火は次回セッションで確認する。既存ユーザー設定のバックアップは `~/.codex/config.toml.before-completion-sound`。

## 保証範囲と検証

同じロックを使うrunner、hold、guard間の競合をOSが防ぐ。ロックを経由しない任意の手動コマンドまで強制的に禁止する仕組みではなく、手動CodexはAGENTSの手順を守る。長期作業の期限と排他の再確認も必要。Windows側の起動直後でまだLinuxロックに到達していなくても、先に取得した側が優先し、後から来た側は取得できない。

`make autopilot-test` は一時Git/worktree、実プロセス、flockを用いて検知・差分・固定SHA・dirty・Git操作途中・ログ分類・token・排他・解放を確認する。設定済みrunnerがある環境では、そのコピーが手動hold中にskipし、解放後にcheckできることも、偽CLIと隔離設定で確認する。本番のCodex実行、scheduler変更、DB投入は行わない。

今回の確認：13件成功。期限切れは仮想待機、プロセス終了・stdin EOF・別プロセスからの競合は実プロセスで確認した。実環境でもhold／token確認／JSON reviewを行い、未反映2 commitと `85a40d4` に対応する正常終了ログを検出した。summary末尾に改行がなくEND記録が同じ行へ連結される既存ログも回帰対象にした。Python構文検査と `git diff --check` を実施。サービスコード・DBを変更していないため、アプリの全E2E／buildは今回の検証対象にしていない。
