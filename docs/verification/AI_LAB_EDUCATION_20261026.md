# Issue #36：初回実推論と有限の教育サイクル

2026-10-26。[最新指示](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6416895482)に従う。開始時main/originは`fdd05df8dd5b7c0f6c780caf2ad0a4c8c8d59eb9`、旧labは`af31afd5523655da45d2ceab87e0bca37cecd7dc`。共通holdを取得し、既存自動開発の未受入0・cleanを確認。mainの既存未追跡`memo.txt`、community確認環境、Issue43のbeta専用KG、Worker/公開ゲートを保全。

## 実行結果

**1課題・1 POSTが完了、追加学習0回、送信前保留2件。** 3 UUIDを独立記録し、保留にはdispatchがない。timeout後の再送ではない。既存75℃未満・GPU使用率5%以下・VRAM/RAM/disk条件を変えず、送信前にcommon lock・固定Kev版・実測値を確認。gpu_busyだけを有限時間再観測し、条件不適合値を合格値に置き換えない。

| run | 結果 | 実送信 | 観測ピーク 温度/GPU/電力/VRAM |
|---|---|---|---|
| `d7b5d424-da98-4e44-9521-adca9b4c93ed` | gpu_busyによる送信前保留 | 0 | 72℃ / 16% / 9.06W / 5112MiB |
| `6386ab6c-380e-4a8e-a008-e718fa33df24` | gpu_busyによる送信前保留 | 0 | 71℃ / 13% / 8.90W / 5091MiB |
| `c93ab46c-e14b-446e-8620-05d2d3b6843e` | 実モデル応答・機械検証完了 | 1 | 74℃ / 99% / 71.31W / 6378MiB |

送信時22:40:46 JST、70℃・GPU2%・空きVRAM2770MiB・空きRAM13695MiB・disk905874MiB。client wall **5.237637秒**、provider latency4798.6ms、input3274/output274 tokens。約0.5秒を目標に35標本（nvidia-smi呼出時間を含む）。前基線8標本：70℃、GPU0〜32%、電力6.88〜8.28W。後10秒の18標本：72〜73℃、GPU0〜2%、電力7.04〜35.23W。発熱/使用量には他process・キャッシュの影響を含み、全量をこの推論だけの因果としない。80℃ガード作動なし、Kev停止なし。[全試行の要約](ai-lab-education-20261026/measurements.json)

固定`pluto-supervisor`／`purpose-role-v1`で`path-400881205d404a66cd397e09`（手塚眞）を選択。

- Claim `cc2bc0c3-d8e7-47fe-8aaf-1b219bff0137`：手塚眞 → CONTRIBUTED_TO → PLUTO、SUPERVISION、第1巻／ISBN9784091874313。探索方向はPLUTOからincoming。Claimの向きを反転して新事実を作らない。
- 支持Citation `b775cbf3-4cff-41ea-986d-1f067e14f073`、Source `b7266fbf-a778-407e-8a4b-374b97523a26`。実際のbeta公開KGで全候補のEntity/Claim/Role/scope/支持出典を前後revision不変のまま照合。
- Kev `bf75a6a8848ea6960ff2ed108d9ed44c2941174f`、base `dc7cdfe2ee4154fa7e30f5b51ca41bfa40174e68`、upstream `5e42a7a03f28134853dd3ff77461457e921e5ec1`、CUDA FP32。実行コードは旧lab固定SHAとファイルhashに拘束。
- result SHA `c04111395d5111a5422df91541639903b0a5b0455b93c656cf3d448c95ab749f`。raw/wire/model確率・資源標本はprivate sealに保持。確率を正解率として表示しない。draft一致だが`semanticAccepted=null`、人間採点承認なし。

## 教育サイクル

最新main起点の`codex/ai-lab-education`へPython実行/候補生成/固定公開入力/暫定採点/テストを選別移植。旧branchの一括merge・旧UI再配備はしない。

`education.py`はintent→4開発課題とsplit/candidate準備→保存run又は明示単回推論→機械検証/暫定評価→分類→課題/方針候補→版付き再評価で終了する。共有lock＋private lock、1 cycle最大1POST。intentだけ残る中断は再送不可。常駐/スケジュール/課金/自己承認/モデル配備はない。

実応答runのcycle `4ff3c022-2c6e-4ed7-b40b-f2e1d4507124`が完了。[公開可能なreceipt](ai-lab-education-20261026/education-cycle.json)。保存応答を再利用して新規推論0回、4課題×2非AI方針の比較8件、draft-match-awaiting-review、候補採用なし、重み更新なし。送信前保留runのcycle `37a60315-7eb3-4424-84b0-c33415297ba5`も無送信で実行し、preflight-heldに分類。train/finalは空で、Entity/Claim重複や言い換えによる漏洩を拒否する。実教育の合格/成長/汎化とは報告しない。

## 学習成立性を分離

**FP32・共有Kev併存・追加VRAM2GiBという旧案が不成立**。学習全体の不可能判定ではない。[8GiB方式比較](../design/AI_LAB_TRAINING_FEASIBILITY.md)を参照。読み取り専用・network none・GPUなしの独立コンテナでヘッダ/依存を確認。bitsandbytes未導入。共有環境には追加しない。[preflight](ai-lab-education-20261026/training-preflight.json)

CPU独立ロードは成功：wall28.905秒、peak RSS4222.68MiB、RAM6GiB/2CPU制限、adapter非merge・pointer head込み、GPUなし。前後GPU72℃、共有Kev allocated bytesはともに3028727808、モデル版不変。forward/backward/Optimizer更新/checkpoint保存は未実施。[実ロード要約](ai-lab-education-20261026/cpu-load-only.json)。データ未準備は実教育/能力評価の条件であり、合成入力によるインフラ段階検証を不可能としない。

## 公開投影・旧環境保全

v2は厳密な許可field・hash・履歴追記・方向/証拠照合を維持し、実応答／送信前保留／失敗／不明を区別する。完了かつ検証済みのKev応答だけを実推論回数へ加算。学習契約はなく0回。v1 birthと既存7件は完全不変。公開artifact SHA `7130ee54dffe4d33ec8da512b6f6ce992647f3399954aed061b5e5620602abe3`。[公開JSON](ai-lab-education-20261026/public-artifact.json)

Webへは公開専用directoryのみを指定し、private runtime、wire、採点labels、実行APIを渡さない。公式/見習いはIssue39の既存Identity/プロフィール導線を維持。公式AIの発言生成・投稿・新しいtimeline保存は追加していない。

[旧lab差分116ファイルの台帳](ai-lab-education-20261026/legacy-inventory.json)。元7runのUUID/bytesを保持してprivate homeへ複写し、新3試行は新規UUID。旧worktreeのignored runtime・静止/動作比較素材はそのまま保全。本線に依存する新しい永久隔離serviceは作らない。旧比較環境は資料保全目的で残し、所有者の終了確認なしに削除・強制終了しない。

## 検証

- Python標準テスト30件通過。単回/重複/timeout/中断/熱・資源gate/ロック喪失/split漏洩/未承認labels/改ざん/test-double非公開を検査。
- AI/Graph/navigation/film/member表示を含むnpm標準suiteの72ファイルが通過。build並行中に既存2ファイルが時間切れとなり、build終了後に当該2ファイル22件を1workerで再実行して全通過（全74ファイルの確認完了）。時間制限を緩めたり失敗testを削除していない。
- ESLint変更箇所通過、webpack公開buildとTypeScript通過。元のNext16.3.8ガイドを参照。
- loopback3269で日PC明/英スマホ暗の実画面確認通過：実推論1/学習0/10記録、70→74℃と5.24秒、根拠往復、Graph状態復帰、アカウント入口、自動浮遊・低減/画面外/非表示停止、noindex/CSP/read-only/比較ルート404。page error/モデルアクセス/アプリ書込0。

main固定SHA受入・既存3200への同一build反映と公開beta結果は、実施後に本記録へ追記する。VPS/正式サイト・共有Kev・KG apply/restore/seed・会員DBの変更は行わない。
