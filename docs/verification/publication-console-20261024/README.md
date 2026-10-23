# 公開配送のコンソール表示修正（2026-10-24 JST）

## 原因と変更

Plunode-Publication-DeliveryだけがInteractive/Limitedでコンソール用のwsl.exeを直接起動していた。Task SettingsのHidden=trueはconsole非表示の指定ではない。実PE headerでwsl.exe=Windows console（subsystem3）、wscript.exe=Windows GUI（subsystem2）を確認した。5分起動と一致する表示原因となる構成を、既存CollectionWorkerと同じGUI入口方式で修正した。旧版の短い手動観測では一瞬の表示自体は捕捉できておらず、旧画面を撮影できたとは扱わない。

修正commit **47196c892a8fd10339cfd06956795c3daad4f74f**。公開配送専用の `publication-delivery-launcher.wsf` を非仮想化の `C:\Users\nishr\plunode-publication-delivery\delivery.wsf` へSHA照合して配置。**wscript.exe //B //NoLogo → 固定WSL queue**を `Run(command,0,true)` で起動する。0は子生成時の非表示、trueは完了待機。実終了codeをWScript.Quitでtaskへ返す。任意argv・shell・署名・新nonce生成は追加していない。

GUIラッパーSHA **c6ea0caa9649a8e99e652aac9264dcf003309ba9c9c698d9f8d6efa794a9a2b8**。TaskはReadyで更新し、Action（Execute/Arguments/WorkingDirectory）だけ変更した。Action以外の全XML child、5分起動のanchor・logon trigger・enabled・Interactive/Limited・IgnoreNew・30分上限は完全一致。元XMLは `C:\Users\nishr\.codex\tmp\publication-console-20261024` に保全した。

## 維持した動作

WSLの固定sourceは676284fb7144bd523df21576be15afd15a874cfaのまま。delivery.jsonのSHAは6bf2f4e6817424022912f66a76dd4267fab886caa33da045ad700579fabd24c7で不変。配送・attest・coordinationの設置bytesを元commitと照合し不変。signature/nonce/queue/同nonce復旧・VPS・Worker設定・公開KGは変更しない。実データapply試験は行わず、完成済みqueueの通常skipを使用した。公開revisionもb74a4b00-9454-412f-af5d-1317713a543cを維持。

CollectionWorkerとAutopilotはExport XMLを前後照合し完全一致。各wrapper/runnerも変更していない。公開配送だけのlast-run.jsonへsource・開始/完了・exitを記録する。子のstdoutをconsoleへ表示する必要はなく、WSLのdurable jobとTask Schedulerの終了codeはそのまま使用する。

## 検証

- ホストを隔離したJScript5試験成功：固定queue・非表示・同期wait、子失敗code37の伝播、起動失敗code1、引数欠落/余分/改変拒否、診断log失敗でも子codeを維持。
- PowerShell登録/更新script構文成功。Windowsの実wscript.exeでも不正sourceをcode2で拒否し、WSL子を起動しなかった。
- 実タスクの手動起動は01:33:04 JST、launcher完了01:33:05、task exit0。computer-useのsky.list_windowsによる16:32:59.680Z〜16:33:13.899Z（135 sample）では新window0。windowの読み取りだけを使用し、端末UI操作・認証操作はしていない。
- **通常予定起動01:35:23／01:40:23 JSTが両方exit0**。ラッパーlogのsource・開始/終了・exitとSchedulerの記録が対応し、次回01:45:22 JST。手動起動でtriggerを変更していない。
- 01:40を対象とした背景観測はツールsession消失により確認不能のため、画面検証の根拠には採用しない。**01:45の通常起動を跨いだactive cell内の追加観測で確認を完了した**。観測は16:45:07.476Z〜16:45:40.054Z（約33秒・340 sample）で新window0。実taskは01:45:23 JSTに起動、01:45:24に完了してexit0。次回は観測時01:50:22 JST。今回は背景promiseを使用せず、観測中のsessionを保持した。

標準node.exeが古くnode --test非対応だったため、既存Codex同梱Node24を使用した。UNCのtest discoveryは失敗したため、SHA一致のローカル隔離copyで5試験を実行。実配置先のWSFは同一SHAである。実行policy/セキュリティ設定や既存taskには変更していない。

## 運用・復旧

登録scriptは新規作成を従来どおりdisabledで行う。既存taskのAction更新には `-UpdateExisting -SourceCommit FIXED_WSL_SHA` を使用し、自身の固定Actionだけを受理する。Runningなら中断せず停止して安全な地点を待つ。元XMLを保存し、設定・権限・triggerを保持する。将来source更新時にもこのGUI Actionを使い、wsl.exe直接Actionへ戻さない。

切戻しが必要なら、Ready地点で現在の公開配送Actionが今回のGUI設定と一致することを確認し、保全XMLの旧ActionだけをSet-ScheduledTaskへ戻す。enable/trigger/他taskは変更しない。旧Actionではconsole表示が再発し得る。WSL/VPSの成果・nonce・receipt・queueは削除/restoreしない。Web code/UI変更なしのため3200/beta/VPS Webの再buildは不要。

**完了：** 手動起動の画面観測、通常予定起動3回の正常終了、通常起動を跨ぐ画面観測、他2 task不変を確認した。利用者の追加操作は不要。公開配送・同nonce復旧のcodeとscheduleは維持されている。
