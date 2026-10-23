# P33-ACTIVATE-20261023：承認受領・有効化途中

最終目標は、運営者の固定データ公開承認後に転送・検証・単回apply・公開後検証・結果記録をCodex/VPS手動公開作業なしで完結すること。**現在はVPS有効化の運営者sudo実行結果待ちで、全体の本番有効化完了や#33完成ではない。**

## 承認

[固定差分](https://github.com/isinxnisi/graph-knowledge/issues/33#issuecomment-6357863177)に対して、運営者がチャットの選択回答で以下を明示した。

- 暗号化backup2 fileのPC/VPS外保管・コピー先SHA一致・phrase別保管を確認済み。これは運営者確認であり、モデルが外部保存先やphraseを閲覧したという意味ではない。
- VPS/WSLフラグ、専用Windows task、既存pause-new/署名閉鎖に従う公開準備の有効化を承認。**実データapplyは除外**。

秘密値・phrase・新しい意味承認を受領/生成していない。正式未公開1 Claimと既公開50 Claimを維持する。

## 実施済み

固定helperのVPS受信SHA3619a0…と最新API revision88437056…を再確認。運営者に一度のVPS sudoコマンドを提示した。PAT/phrase再入力は不要であり、権限の再承認ではない。sudoを迂回していない。

WindowsはUNCの未署名.ps1を既存RemoteSignedが拒否した。script未実行、policy/署名設定の変更、Bypass/Unblock/IEXは行っていない。その後、承認済みの定義を固定引数でWindows標準ScheduledTasks cmdletへ直接渡し、専用task **Plunode-Publication-Deliveryをdisabledで登録**。current user nishr / Interactive / Limited / IgnoreNew / 30分 / 5分+logon、固定source35688b4のroot-owned Python→UID1000→--queue。既存2 taskのExport XML SHAは前後一致。登録script bytesもcommit35688b4と一致した。

短時間の既存共通hold・token再確認下で、WSL `/etc/plunode-publication/delivery.json` のdeliveryEnabledだけfalse→true。old config SHA **d7cf3aec110b5778d5129e795b1638259f7cd04dd68a475baf326ff6e314f483**、new **0a5f290e85d0055bdff6afcf3f1f86e992be6c579f0292f6c0ff5c2b8454665c**。旧bytesを `/root/plunode-publication-delivery-activation.kt38m8_j` へfsync保存し、原子置換・親fsync。root self-checkでflagtrue/鍵pin/実UID1000の子を確認し、**signed=false/applyCalls=0**。

通常UIDから新固定queue入口を実行し、**no-signed-pending-jobでexit0**。署名済みpending0。Worker config d3411e… / control revision2 / pauseMode=null / activeAttemptなし / receipt10を再確認。Workerの設定・state・cache・既存taskへ変更なし。

## 次の工程と再開位置

1. 運営者のVPS helper結果 `publication-enabled-no-apply` / deploymentEnabled=true / apply0 / root保全先を受領し、SFTPのexport/activation-20261023.jsonも独立照合する。失敗時は現在flag/保全先から診断し、installer再実行や強制解除をしない。
2. VPS確認後、同じ専用taskだけを有効化し、実Task Scheduler→WSLの空queue実行がexit0で完了することを確認。次回予定、他task不変、公開revision/receipt不変を記録する。
3. 承認済み運用scopeの範囲で正式未公開1 Claimの候補を最新base/receiptで再確認し、新しい本番用nonceのarm・通常pause-new/ACK・最新plan・job登録まで準備する。readiness試験の取消済みnonceを使い回さない。
4. 固定release/artifact/receipt/live plan/revision/nonceと追加・更新件数を提示して、**別のデータ公開承認**を受ける。署名入口で運営者が承認するまではapplyしない。既公開50 Claimを再公開しない。

WSLだけの有効化を全体完了と扱わず、VPS結果受領前はWindows taskをdisabledのまま維持する。切戻しは専用task disable/WSL false/VPS既知SHAのflag falseで、KG・receipt・nonce・ticket・署名・pauseを保全する。実行中処理の強制停止や自動restoreをしない。

画面・Webサービスは変更せず再buildしない。共有mainの他作業とmemo.txtへ介入せず、今回の記録は独立branchでcommit・通常pushする。

## 後続：有効化と公開候補準備が完了

[最新の有効化結果・固定公開候補・署名承認手順](enabled-and-prepared.md) / [状態JSON](enabled-and-prepared.json)。本番ゲート/WSL/taskは有効化済み、署名とapplyは別承認待ち。上記のsudo結果待ちは途中記録。
