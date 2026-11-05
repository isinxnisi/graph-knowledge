# AI教育Workerのローカル自動起動復旧

追補：この記録内の20–23時・1日1回・24時間毎分は復旧時点の旧設定。取りこぼしていたIssue #36 r02と11月6日の追加指示を反映し、同日中に05–08時・5分間隔・暫定最大4回、朝窓と評価後だけの定期起動へ変更した。[現在の運転手順](../runbooks/AI_LAB_AUTONOMOUS_EDUCATION.md)。原検証値は当時の証跡として保持する。

2026-11-06 JST。ユーザーの「日次教育が動かない」確認を受けて、ローカルの起動入口を修正した。Windowsスケジューラを使う方針はユーザーが明示了承。共通holdの先行作業には許可を得て解放依頼を送り、先行作業の完了・解放後に自分のholdを取得した。

## 原因と変更

- 設定はenabled=true・20–23時JST・1日1回のままだったが、旧daemon PID369350は存在しなかった。最後の判定は10月30日14:29 JST。常駐起動だけでOS/WSL再起動後の入口がなかった。
- 固定実装`40289cf69ce5370bf2b41ece923d3f88525836c4`をmainへ受入。Windowsの新規専用予定`Plunode-AI-Education`がログオンと毎分、`autonomy.py scheduled-tick`を有界・foregroundで起動する。常駐PIDへの依存をなくした。
- 最終実装`498ac7bc7969858dc73b86df5dda123f86869971`では起動cwdをrepositoryへ固定し、Pythonの`-B`を含む実コマンドでprocess同一性を照合する。実Windows呼出しの`processVerified=true`を確認した。
- PythonにWindows APIを持ち込まず、Windowsはcron相当の起動アダプターだけとした。既存`tick()`の時間窓・実intent日次上限・共通guard・pause/stop・コード指紋・未完処理の再送禁止を再利用する。
- `IgnoreNew`とdaemon lockで多重起動を抑止。終了済み・再利用PIDの記録は履歴へ保存し、他processへsignalを送らない。有限呼出しの終了後はPIDを残さず、`status`は実プロセスの照合結果と最後の定期判定を返す。
- Windowsは現在ユーザーのInteractive／Limited、WakeToRun=false。launcherは非表示で作成し、実行ポリシーの全体設定は変えていない。実行上限10分は起動・同期を含む外側の上限で、学習の180秒上限は変更しない。

## 実機確認

| 確認 | 結果 |
| --- | --- |
| Python回帰 | 57件成功。残留PID・PID再利用・daemon重複・停止保持、実foreground子processの連続起動を含む |
| PowerShell構文 | 実parserで成功 |
| Windows起動 | 01:42 JSTに実起動、最終結果0 |
| 定期起動 | 01:43以降、手動起動なしで1分ごとの判定を確認 |
| 残留PID | 元のPID369350を履歴保存し、自動起動を阻害しないことを確認 |
| 停止 | `stop`後、01:44の自然な定期起動がpausedとなり、設定と停止要求を保持 |
| 再開 | `resume`後、01:45/01:46の自然な起動で再判定を確認 |
| 共通ロック | 作業hold中はcommon-lock／exit75で延期し、教育を開始しない |
| 起動の観測時間 | 最初のWindows起動01:42:07→判定記録01:42:09.14、約2秒（壁時計。CPU使用時間ではない） |

予定の最終結果0は起動・判定の結果で、推論・学習成功を意味しない。今回、新たな推論・Optimizer更新・教育cycleは0。旧4件（合成基盤1件を含む）の公開教育記録は保持した。今日11月6日の教育判定窓は20:00–23:00 JST。資源・失敗時停止・未接続のChatGPT方針に関する従来の条件は変えていない。

PC全体やWSL全体の再起動は、並行作業保全のため実行していない。ログオンtriggerの実登録と、同じ入口による実自動起動・残留PID復旧を確認した範囲である。電源off／ログアウト／sleep中は動かさず、復帰後の予定で判定する。

## 保全と運転

既存Autopilot・収集Worker・公開配送・作業状態観測の4予定はexport XMLのSHAを前後照合して不変。共有Kev・KG・会員／知識DB・他sessionのWorkerを変更していない。既存3200のWeb build `Q8tWL8ZC-xDKMN_5bTqHO`、`.env.public`、KG revisionと既存container IDを保持。Web/UI変更はなく、不要な再build・サービス再起動・migration・VPS変更をしていない。mainの`memo.txt`を保持。

CPU用固定imageとNodeは既存配置に存在し、private homeは約448MiBで既存2GiB上限内。コード変更に伴う指紋だけを固定し直し、それ以外の運転設定を保持した。GitHub評価の初回実方針受入は別件で、自動起動の成功へ混同しない。

[起動・停止・再開手順](../runbooks/AI_LAB_AUTONOMOUS_EDUCATION.md) / [実機の固定記録](ai-education-startup-20261106.json)。通常はPython側の`pause`／`stop`／`resume`を使い、`start`常駐方式を重ねない。定期呼出しの間にPIDがないのは正常で、予定とheartbeatを確認する。
