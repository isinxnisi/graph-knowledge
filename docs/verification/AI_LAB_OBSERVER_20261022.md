# AI育成ラボ：初稼働準備・観察画面の検証

2026-10-22 JST。[設計](../design/AI_LAB_OBSERVER.md) / [起動・再検証手順](../../prototypes/ai-lab/README.md)。

確認URL：**http://127.0.0.1:3286/ai-lab**（同じPCのloopback）。WSL・Windows双方でHTTP200。確認用サーバーを起動し、レビュー用に維持する。Tunnel・外部公開・再起動後の自動起動は追加していない。

## 今回できたこと

- 固定4課題の[一括レビュー資料](ai-lab-20261022/REVIEW.md)と同一内容の画面表示。探索目的、候補、期待結果案、元Claim、方向、Role、ISBN scope、Citation/Sourceを確認できる。
- 保存済みの7記録を使う観察ノート・実行履歴・課題レビュー・準備状況。5件の非AI実行と2件の推論前保留を区別する。実推論完了0件、追加学習0回。
- 実Home・Explorer・アカウント・Claim Readerとの往復。tab/filter/run、根拠欄、スクロール、既存Graphの枝/座標/zoom/pan復帰を確認。
- モデルをロードしない独立コンテナの境界検証と、重みの実サイズに基づく学習予算案の不成立判定。
- [VPS読み取り診断手順](../runbooks/AI_LAB_VPS_READONLY.md)と初段公開の残作業。

## 開始時の差分と排他

前回成果 `07398da`・`41299aa` の検証記録と実装を確認し、同じ `codex/ai-lab-foundation` で続行した。mainは `bdb682b89942557ea2fa993c3e2b6e1736e723ec`。ラボ開始元 `d237480` 以後は公開ゲート関係の4 commit/14ファイルで、コミュニティUIの追加差分はない。今回mainの新成果をmerge/cherry-pickしていない。

`make autopilot-review` は未反映0 commit、自動側dirtyなし、Git操作途中なし。手動mainは既存未追跡 `memo.txt` のみ。`make autopilot-status` は「null値の式」のエラーとなったため、Windowsの `Get-ScheduledTask` で `GraphKnowledge-Autopilot: Disabled` を読み取り確認した。タスク設定・runner・ロックファイル・当日休止を変更していない。

別terminalでholdを取得し、token付きreviewと変更/検証/commit前のassert-heldを実施。アプリ上ではデータ公開受入の別チャットがactive、本線UIのチャットはidleだった。別の手動作業者不在と断定せず、独立worktreeのみを編集した。既存公開ゲートworktree2つは確認時clean。前回ラボのprivate記録・mainのmemo・他branchを保持し、受入/報告の一括acknowledgeは行わない。

## 4課題の人間レビュー

[REVIEW.md](ai-lab-20261022/REVIEW.md) / [review.json](ai-lab-20261022/review.json)。固定KG SHA-256は `3a342621f5236b701c37abbd0ce047892901e664fe39dfe1b49b2d7a29da8237`、採点案hashは `6691049edde74723f2eaa35ed76bc0167ff6383062c57826bbaf8996748774f7`。初版から変更していない。

| 課題 | 期待結果案 | 人間が確認する点 |
| --- | --- | --- |
| pluto-supervisor | SUPERVISIONが明示された手塚眞への経路 | 同人物でもRole未指定は監修の根拠にしない。第1巻ISBNの限定 |
| pluto-no-outgoing | STOP | 固定snapshotの指定方向で候補0。世界全体の不存在ではない |
| pluto-limited | HOLD | 上限1件で未完。STOPへ置き換えない |
| pluto-other-work | 著者を介する別作品2候補 | 各段のAUTHORSHIPと各刊行物scopeを保つ。作品間の直接関係を推論しない |

全件Codex作成・pending-human。正式正解への昇格、意味的合格、学習用/最終評価用への流用はしていない。資料は生成するたびにtask hash・候補を再検査し、labelsを書き換えない。人間は課題IDごとの承認/修正/保留と理由をまとめて判断できる。

## 再診断と単回推論の保留

[3回の測定](ai-lab-20261022/cooling-samples.json)は00:28:55〜00:29:05 JST。5秒間隔、GPU温度は80/80/80℃、使用率11/2/6%、空きVRAM4,116/4,111/4,111MiB、WSL available RAM14,473/14,466/14,469MiB。swap5,120MiB中3MiB使用、WSL filesystem空き約920,122MiB。Windows Cの実空きは後の測定で69,636,120,576 bytes（約64.85GiB）。WSLの仮想容量と混同しない。

既存条件の温度75℃未満、GPU使用率5%以下、空きVRAM2GiB以上、RAM4GiB以上、disk1GiB以上を維持。3回とも温度を満たさず、冷却余裕・連続運転可否は確認できない。

新run `6eacb306-583e-4fb2-8cdf-45c765b1393f` は00:29:18 JST、`held / not-connected / gpu_too_warm`。`dispatch.json` が存在せず、推論POST0件。旧runの上書き・条件緩和・自動再送なし。親runは前回の非AI明示Role方針。実行コードは `41299aa55dc0f45f11150ae0e89d5e2d1598db26`（推論コード内容は初版と同じ）。

00:53:51の後確認は81℃、使用率6%、空きVRAM4,170MiB、available RAM13,725MiB。これはbuild/画面検証後の瞬間値で、温度上昇の原因や連続冷却性能を特定した値ではない。追加推論は行わない。Kevの公開runtime GETを前後で保持し、共有モデル/配備/依存を変更していない。

公開用artifactは[public.json](ai-lab-20261022/public.json)、32,584 bytes、payload hash `1433bcbb900e7e8dd8344a4d84019bee1e12909b861bcc7da86b288f0f7157d6`。前回の6記録が完全一致し、新しい保留1記録だけ追加されたことを確認した。raw応答・wire・runtime・内部パスを配信せず、Webから推論を起動するAPIもない。

## 独立学習の成立条件

[preflight結果](ai-lab-20261022/training-preflight.json)。既存image ID `sha256:b5b1dcd8fa386e60744f213c3a7ba4b4916adace3372333f6694c8c9c6157d12` を使った一時コンテナを `--rm` で実行した。

実機で確認済み：非root、root filesystem/read-only model volume、network none（loのみ）、GPU deviceなし、資格情報なし、cap-drop ALL、no-new-privileges、RAM512MiB・swap追加なし・CPU1・pids64・tmpfs16MiB。書込試験は一時tmpfsだけ。共有cache・モデル・image・Composeは変更しない。

package metadataはtorch2.8.0+cu126 / transformers5.19.0 / peft0.21.2 / accelerate1.15.0 / safetensors0.8.0。これは既存imageからmetadataを取得できたことの確認であり、学習ライブラリの全組合せの動作保証ではない。

固定baseのsafetensorsヘッダーは873,438,784パラメータ、保存形式BF16/F32、ファイル1,746,942,600 bytes。FP32化した重みだけで3,331.90MiBとなり、提案上限2,048MiBを超える。adapterは10,822,656パラメータ/43,338,624 bytesで、これ以外にもactivation/optimizer等が必要になる。**現予算案でFP32独立学習は不成立**。予算変更・量子化採用・共有GPU利用条件は別判断。

未実施：torch/model import、forward/backward、optimizer step、checkpoint保存/再読込、GPU付き学習runtime設置、実学習、モデル差替え。共有Kevを止めてメモリを捻出する手順は追加していない。

## 画面とテスト

再利用：SiteHeader、UiLocaleProvider、テーマ/フォント、ExplorationPage、DiscoveryHome、Explorer、GraphCanvas、MemberCapsules、ReferenceReader、既存KG読取API・Graph URL復元。生成先だけにラボ入口と復帰を加え、コミュニティの実装/データ/生成先/3275を変更しない。

- Python既存26件＋レビュー3件成功。task/labelsのずれ・存在しない期待候補・承認状態の混入を拒否。
- 表示状態6件成功。非AIの完了HOLD、送信前保留、実API成功/結果不明、学習版不足、test-doubleを区別。学習済みの正例は単体試験内の合成入力だけで、公開artifactには含めない。
- 隔離Next production build・型検査成功。既存main/3200のbuildは更新しない。
- Chromium日英×1440/390の4経路群成功。Home→ラボ→元Home、レビュー→実Graph/Claim modal→元tab・開閉・scroll、ブラウザ戻る/進む、Graphのnode位置/zoom/pan→ラボ→元Graph、アカウント→ラボ→元アカウント。全主要画面の横overflowなし。
- 直接訪問で架空戻りなし、会員/authの未接続503、AI/学習/私的パス404、未知Host404、書込みPOST拒否、CSP、レビュー資料downloadを確認。ブラウザからKev呼出なし。
- レビュー生成物一致、Python構文、`git diff --check`、旧公開6記録不変を確認。

途中で見つかったClaim modalが戻りリンクを覆う問題と、英語→Graphで日本語に戻る問題は隔離overlay内で修正し、最終の4パターンで再確認した。

画面：[日本語PC](ai-lab-20261022/screenshots/ja-1440-overview.png) / [英語スマホ幅](ai-lab-20261022/screenshots/en-390-overview.png) / [保留の詳細](ai-lab-20261022/screenshots/ja-390-held.png) / [レビュー](ai-lab-20261022/screenshots/ja-1440-review.png)。

実機未確認：iPhone実機/WebKit、実Google/session・本人会員データ、VPS内部資源・公開artifact配信、実推論の意味品質、独立学習の演算/保存。アカウント画面の往復は実ログイン成功を意味しない。

## 次の判断と未配置

次に人が判断するのは、4課題の評価基準、冷却/資源条件を満たす単回推論、独立学習の資源案、初段公開時の配信と権限境界。初段公開までの手順は[設計](../design/AI_LAB_OBSERVER.md#初段公開への区切り)に整理した。

今回差分は独立branchだけ。main統合、beta/正式VPS/previewへの配置、VPS変更、共有Kev変更、会員DB・公開KGの変更、コミュニティ既存作業の変更はしていない。3286は同PCでレビューするための読み取り確認先であり、公開済みサービスではない。
