# Plunode 開発・運用の統合一覧

**[現在の管理一覧を開く（5区分）](https://github.com/isinxnisi/graph-knowledge/blob/codex/work-status/WORK_STATUS.md)**

[予定・セッションを編集する小さなJSON](https://github.com/isinxnisi/graph-knowledge/blob/codex/work-status/WORK_SESSIONS.json) / [GitHub編集画面](https://github.com/isinxnisi/graph-knowledge/edit/codex/work-status/WORK_SESSIONS.json)

一覧は専用branch `codex/work-status` に置く。開発mainへの定期commit・checkout・mergeはしない。このmain側ファイルは入口と固定の運用説明で、稼働情報の複製ではない。

## ChatGPTから予定を登録・変更する

GitHub連携で **branch `codex/work-status` / file `WORK_SESSIONS.json`** の `sessions` を編集し、通常commitする。自動生成Markdownを編集する必要はない。例えば「ルーム基盤を予定に追加」「AI育成ラボを進行中に変更」「次の対応を更新」と依頼し、既存IDとセッション名を保持して必要な行だけ変更する。

```json
{
  "id": "new-session",
  "name": "新しい構想",
  "state": "予定",
  "stage": "構想段階。詳細設計は未着手",
  "next": "着手時に範囲を整理",
  "environments": []
}
```

状態は `予定 / 進行中 / 保留 / 完了`。名前・現在段階・次の対応は人間管理であり、AIやWorkerの状態から自動分類しない。環境を使う場合は同じJSONの `environments` にあるIDを参照する。ポート・用途・URL・worktreeの**設定上の関係**も環境側で一元管理する。固定業務は `operations`。完了セッションは折りたたむ。

次の正常な30分更新でMarkdownへ反映する。自動処理は手動JSONと他のファイルを変更しない。JSON不正・取得失敗・push競合では既存一覧を保全し、次回再試行する。並行編集にforce pushを使わない。

## 通常更新と手動確認

Windows task **`Plunode-WorkStatus`**：通常ユーザー、30分周期、StartWhenAvailable、IgnoreNew、最大3分。ログオン済みのPCが停止・休止している間は観測できない。復帰時の取りこぼし処理と次回予定に従う。wscriptのGUI入口が子PowerShellを非表示で起動し、終了まで待つ。既存のCollectionWorker・配送・Autopilot・ログオン復帰taskを変更しない。

Windows PowerShellで、状態取得と差分反映を一度行う：

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$env:USERPROFILE\plunode-work-status\runner.ps1" -Mode Run
```

WSLから既存のWindows観測を使ってプレビューだけを作る：

```bash
python3 -B ~/.local/share/plunode-work-status/work-status.py \
  --config ~/.local/share/plunode-work-status/config.json
```

`--publish` を加えると差分をGitHubへ反映する。Windows観測は直近90分以内のみ採用する。通常はWindows側runnerを使う。私有設定の絶対パスや認証helperは公開JSONに書かない。既存の非対話Git認証を使い、認証情報はコード・設定へ埋め込まない。

ローカルの軽量記録はWSLの `~/.local/share/plunode-work-status/last-run.json`（毎回の結果）、`last-observation.json`（直近観測）、`preview.md`。Windows側はユーザーホームの `plunode-work-status/last-run.log`。履歴DBや通知は作らない。公開状態に差がなければpushしない。pollの起動時刻・次回時刻・Running/Readyの揺れだけではcommitせず、日付が変わった最初の成功時に観測を更新する。

共通ロックが使用中ならスキップし次回へ回す。取得したロックは既存state・小さなreceipt・Git metadataの短い読取後に解放し、HTTP／Docker／GitHub待機中に保持しない。専用bare Gitの独立branchのみを更新し、共有mainや既存Git indexを触らない。単独の更新ロックも強制解除しない。

## 取得する情報と限界

- A：既存作業・設計チャットと現行検証記録から初期登録。以降は手動JSONが正本。会話の自動読取・AI要約は行わない。
- B：実 `ss`、プロセスcwd、Docker状態、Git worktree metadata、Windows cloudflared数、既存公開API。用途・port設定と実測は分ける。絶対パス・PID・内部IP・Docker環境変数・SSH設定・鍵は公開しない。
- C：Windows Task Scheduler、CollectionWorkerのstate/health、既存公開準備health、配送jobの必要なfield。267009は実行中であり、終了成功ではない。既存Workerを起動・再起動しない。
- D：既存stateに記録済みのreviewと小さな正式receiptをUUIDで小集計。正式受入分の公開件数は既存照合summary・通常公開準備health・承認待ち候補ledgerを再利用し、そのreceipt fingerprintと現在の公開API revisionが一致する場合だけ正式未公開件数を表示する。新receiptや公開版の変化では未確認へ戻す。意味・根拠の再検証、全データ走査、収集・受入・release/plan/applyの実行は行わない。
- E：固定の人間作業。承認・署名・サービス制御機能は持たない。

公開APIの応答はVPS内部のDocker・port・sudo権限やサービス状態の確認ではない。betaの認証なしAPI確認が失敗する場合は未確認を表示し、新しい秘密情報の配置は要求しない。現在の構成で取得できない情報を推測しない。旧停止依頼・保存保留は過去を含む台帳で、現在の残件数と区別する。

観測時刻から90分以上経過した一覧を「現在も正常」と扱わない。GitHub更新に失敗した間も前の一覧と手動登録は残り、ローカル記録とtask結果で失敗を確認できる。コードを変更しても導入済み固定コピーは自動更新しない。導入はレビューしたcommitからこの専用taskのファイルだけを置換する。

定期処理はPython標準ライブラリ・Git・Windowsの既存管理機能だけを使う。Codex・ChatGPT・Gemini・Kev・AI API・GitHub Actionsを起動しない。専用branchは2つの管理ファイルだけから開始し、GitHub Actions workflowを含めず、専用Git操作はhooksを無効にする。後からworkflowが追加された場合も更新を停止し、間接起動を防ぐ。**定期更新のAIトークン消費は0**。

## 導入・検証記録

[2026-10-25の実測・隔離試験・task確認](docs/verification/WORK_STATUS_20261025.md)。本機以外での導入は、ローカルパスと既存取得元を私有configへ設定し、レビューしたスクリプトを配置する。既存taskの変更やVPS配置は不要。
