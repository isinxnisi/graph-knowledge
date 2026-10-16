# 収集テーマ候補

2026-10-16。ユーザーが挙げた7企画と、既存生成器への接続を確認する1試験候補。**famous-manga-creators r0002のみ候補生成を正式承認・実行済み。他は未承認**。実行時は管理用CLIが、版・定義hash・承認記録・取消・固定入力を照合する。

定義・操作・公開との境界は [収集テーマの契約](../../docs/design/COLLECTION_THEMES.md) を参照する。

`famous-manga-creators` は[企画レビュー](../../docs/design/FAMOUS_MANGA_CREATORS_REVIEW.md)の44中心作家＋9共同制作者・102作品を対象範囲として合意した。r0002の8作品・12人物照合は[プロジェクト運営者の正式承認](approvals/famous-manga-creators/r0002.json)を既存CLIで記録し、候補生成を完了した。[結果と次の人間レビュー](../../docs/research/famous-manga-creators/20261016/r0002-run-review.md)を参照。個別知識の受入・公開は未実施。試験専用registryの承認は転用せず、旧r0001は未承認のまま保持する。

| ID | 目的 | 現時点の実行条件 |
| --- | --- | --- |
| `famous-manga-creators` | 漫画家と別作品への入口を増やす | r0002は8作品／12人物照合・通信／出力上限・コード／入力hash固定。正式承認・候補生成済み、未受入・未公開 |
| `manga-influence-mentorship` | 根拠のある影響・助手経験を辿る | 未指定。師弟・影響・助手を同一視しない |
| `work-production-backgrounds` | 作品の制作背景と異なる役割の関係者 | 未指定。原語・版・役割の範囲を確認する |
| `nobel-laureates-research` | 受賞者から研究内容へ広げる | 未指定。研究成果・受賞モデルは未確定 |
| `quantum-mechanics-history` | 研究者・開催回・研究内容を辿る | 未指定。会議参加から共同研究を推測しない |
| `ai-computing-lineage` | 人・組織から技術発展へ広げる | 未指定。技術の派生・発明の関係は別レビュー |
| `screen-games-music-production` | 異なるメディアの制作の系譜 | 未指定。初回実行で対象を狭め、必要なら分割 |
| `nobel-affiliations-replay` | 凍結済み公式所属資料の候補再生成 | コード・入力hash固定済み。ただし未承認で実行不可 |

一般企画の `execution: null` は収集処理が実装済みという意味ではない。承認後のexportも企画検討専用となる。具体的adapter・上限・入力を含む版の承認が、実収集を始める条件。

`themes/<id>/rNNNN.json` は登録後に編集せず、次の版を登録する。承認記録はレビューした人の明示判断がある場合だけ `approvals/` へ作成する。テスト用の承認をここへコピーしない。ジョブ成果と試行履歴はGit外に置き、原資料台帳と公開releaseを上書きしない。
