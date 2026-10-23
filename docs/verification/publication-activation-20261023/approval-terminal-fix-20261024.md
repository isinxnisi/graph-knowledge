# 公開承認端末入力の停止原因と修正（2026-10-24）

運営者が固定nonce `b36af1ba-d283-412e-aa29-465d360928b7` の承認コマンドを実行し、固定requestの表示直後、release ID入力要求より前に停止した。ローカルqueueはjob.jsonだけでapproval.jsonなし。固定VPS statusはawaiting-publication-approval、ticket generation1/open、pause-new revision3。公開API revisionは88437056-b74f-42ab-88c0-33ed435bdcccのまま。

原因はroot承認入口の `open('/dev/tty','r+')`。Pythonのtext update modeがseekを要求し、端末では `UnsupportedOperation: File or stream is not seekable.` になる。隔離PTYで同じ例外を再現した。入力要求より前なので署名には到達していない。直前の自己診断は端末確認を通らず、この実端末経路の検証が不足していた。

修正は同じ `/dev/tty` をUTF-8のread/write別handleで開くことだけ。両方isattyを検査し、画面へpromptをflushし、入力が固定release IDと一致する場合だけ後続へ進む。stdin/pipeからの承認、確認の省略、自動応答、別nonce、署名鍵・候補・receipt・gate・配送・Workerの変更はしない。

実PTYの回帰試験5件成功：一致入力、誤入力拒否、EOF拒否、旧r+例外の再現、controlling TTYなしでpipe入力を拒否。試験は合成release名のみを使い、main/署名/鍵/SSH/DBに到達しない。既存DB試験は繰り返していない。

配置はレビュー・commit・pushしたroot承認入口だけを、旧SHAと固定新SHAの照合、root-private保全、atomic replace/fsyncで更新する。WSL配送snapshot8ee3702・設定・専用task、VPS tuple、元jobはそのまま。新入口の自己診断と、同じ隔離PTY試験を配置先でも行う。配置結果は別記録へ保存する。

承認済みの配置・修正範囲で進める。実データ公開承認は端末のrelease ID確認が未完了なので、モデルは署名しない。修正後、運営者が同じコマンド・同じnonceで確認入力を行う。公開内容・影響はIssue #33 comment6365661819と不変。Worker新規開始のpauseは署名閉鎖まで維持する。
