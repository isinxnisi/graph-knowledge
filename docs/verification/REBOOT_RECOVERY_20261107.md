# 開発PC再起動後の復帰（2026-11-07）

## 結果

ユーザーのPC再起動後、WSL Ubuntuのrootはrwへ復帰し、Windows Cの実空きは約17.7GiB。Dockerのβ用DB・通常KG・共有Kev・既存tunnelは起動済みだった。NodeのWeb／Workerは停止していたため、既存mainとprivate設定を使って通常launcherから再開した。

- localhost:3200のTOP／`/api/dataset`、HTTPS βのTOPはHTTP200。
- 実ChromeでHTTPS βのTOP→PLUTOへ進み、4 Entity／6 Claim／3 Relation、関係グラフ・隣接一覧・詳細を表示した。
- Web、publisher、reviewer、collector、reader、patrolの6 processについて、PIDとcommand・mainのcwdを照合。巡回のqueueing→idle、reviewの通常iterationも確認した。
- 会員DBは69テーブル・migration33件（032まで）。適用済み全checksumをmainのSQLと照合して一致。知識DBは29テーブル、001／002／004／005／006／007／008／009。今回migration・DB復元・再投入は行っていない。
- Google認証やprivate設定、既存データ、共有Kev、VPSは変更していない。本人Googleの再ログイン、保存・投稿の一巡を再試験したという意味ではない。独立3276を更新していない。

稼働するアプリsourceは `7dd6e0dc2292e15bfda01ed4c865822f5add6890`、buildは `fbcBuqYLDLopQ63ecPKsr`。復帰時のmain HEADは文書更新を含む `bd78f9189edf83cb45da081c8c198ab2378b6c71`。今回の記録commitはアプリの再buildを要しない。

## 中断したR3aとの区別

**R3aは実装・対象テスト済み、公開用buildとβ反映が未完了。R3はa〜c、全体はR6まで。**

作業branch `codex/issue75-theme-foundation` の `a5ae031f089ab4c4e64660245cf48d1971050703` は日本語commit・通常push済み。収集計画、範囲を限定した配送API、停止・再開とACK回収、運営画面を含む。52件と既存取込37件、型検査・lintを確認した。別DBへの復元では033追加後も既存69テーブル・checksumを保ち、再実行不変を確認した。復元確認用DBは削除済み。

その後のbuild中にC空き0バイト、WSLのI/Oエラーと読み取り専用化が発生し、buildは完了しなかった。**R3aのmain統合、稼働DBへの033適用、mission配送資格の作成、βの切替は一切行っていない。** 古いstaged-buildの記録だけを信頼して失敗した生成物を配置しない。

当時のholdはEnterで解放したが、readonlyのため手動session記録の更新だけが失敗した。再起動後は共通ロックの空きを確認し、review→新hold→token付きreviewを行って復帰作業を保護した。未受入の自動候補を取り込んだり、一括確認済みにしていない。

## 再開

稼働版の通常復帰はmainで次を使う。認証・DB・private profileを既存のものから引き継ぐ。起動時にbuildやmigrationを行わない。

~~~sh
python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node
~~~

R3aの続きは上記作業branchを起点とし、[固定SHAの設計](https://github.com/isinxnisi/graph-knowledge/blob/a5ae031f089ab4c4e64660245cf48d1971050703/docs/design/KNOWLEDGE_MISSIONS_R3.md)とrunbookを参照する。次は容量を確認して新しいbuildを完成させ、検証済みmainへ統合し、backup・033適用・β切替・実操作確認を行う。過去の一回用配置scriptを固定SHA未照合のまま再実行しない。

build前はLinux `df`だけでなく、**Windows Cの実空き**を確認する。前回この確認が抜けていた。最低10GiBを下回る場合はbuildを開始しない。ビルド中も実空きを確認し、不足に近づいたら配置せず停止する。Nodeのメモリ上限も指定し、再起動後に空きが戻ったことだけを恒久対策と扱わない。今回、追加の生成物削除やVHD圧縮を実施したという報告ではない。

R3bの実際の定期実行接続、R3cの差分からの訂正と通し確認、R4〜R6は残る。復旧だけでR3aや本運用初版を完了扱いにしない。
