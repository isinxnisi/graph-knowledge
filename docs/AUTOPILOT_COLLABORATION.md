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
5. 取り込み後の検証・commit・未反映確認を行い、holdを解放する。自動側はそのbranchを継続し、mainへの自動同期・rebaseは行わない。

この仕組みは通知を会話へ注入するものではない。AGENTS.mdにより、このCodexが作業を開始した時に検知する。常駐通知や多段履歴、受け入れ管理画面は追加していない。

## 保証範囲と検証

同じロックを使うrunner、hold、guard間の競合をOSが防ぐ。ロックを経由しない任意の手動コマンドまで強制的に禁止する仕組みではなく、手動CodexはAGENTSの手順を守る。長期作業の期限と排他の再確認も必要。Windows側の起動直後でまだLinuxロックに到達していなくても、先に取得した側が優先し、後から来た側は取得できない。

`make autopilot-test` は一時Git/worktree、実プロセス、flockを用いて検知・差分・固定SHA・dirty・Git操作途中・ログ分類・token・排他・解放を確認する。設定済みrunnerがある環境では、そのコピーが手動hold中にskipし、解放後にcheckできることも、偽CLIと隔離設定で確認する。本番のCodex実行、scheduler変更、DB投入は行わない。

今回の確認：13件成功。期限切れは仮想待機、プロセス終了・stdin EOF・別プロセスからの競合は実プロセスで確認した。実環境でもhold／token確認／JSON reviewを行い、未反映2 commitと `85a40d4` に対応する正常終了ログを検出した。summary末尾に改行がなくEND記録が同じ行へ連結される既存ログも回帰対象にした。Python構文検査と `git diff --check` を実施。サービスコード・DBを変更していないため、アプリの全E2E／buildは今回の検証対象にしていない。
