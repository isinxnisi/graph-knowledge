# 投稿の状態・未読・取消のUX修正（2026-11-04）

## 配置と範囲

app `c43ed6e0869450541e8824ffbe6e8e2c04998746` / build `ENv2ojr0L28qQLPE2bD9Z` をmain・localhost:3200・HTTPS βへ反映。後続の記録commitでは再buildしない。3276・正式VPSは未変更。

利用者の追加指摘を優先した工程。U6の後追い整理・パッケージ取込・総合一巡を完了した意味にはしない。U6の残りは従前の追加1〜2回の見積りを維持し、U7/U8も別。

## 体験と判断

- 一覧の現在状態をアイコン付きの短い表示にし、未読の結果は別の印・文字で示す。未読だけへ絞り、開くと未読のある受付版へ進む。古い結果を現在の草稿へ付け替えず、表示GETでは既読にしない。
- 取消は共通の中央dialogで投稿名・止める処理・残る公開知識を確認する。結果確定後は一覧上部へ戻り、完了案内にfocus/scrollを移す。通信不明は完了を装わず同request IDで再試行。
- 取消済みの再訪ではフォームより上の明確な案内と閲覧用内容を表示し、押せない保存/送信ボタンを残さない。
- 左navigationとアカウントmenuの再選択は一覧へ戻る。未保存guard、投稿/受付版の直接リンク、修飾クリックは維持。
- GraphCanvasはcanvasとguideを返すが、外側がcanvasだけの固定高だったため、文字が投稿項目へ重なっていた。別のgrid行で高さを確保し、図の見方を開いても項目を押し下げる。投稿previewのみ表示操作を絞り、小さいcanvasから操作ボタンがはみ出す問題も抑えた。通常Graphの既定操作は維持。

## 検証

関連14file・118テスト、対象ESLint、production build・全体型検査成功。状態/未読の分離、古い未読受付版、取消済み再訪、確認前の非送信、確認後の一覧/focus、通信不明の同request再送、menuから一覧への復帰を含む。型検査でテストのthis注釈2件を修正し、動作を変えず再build。既存cacheを使い、exportの全source fileとcommitの一致も照合。

実Chrome・HTTPS βの既存Google本人sessionで確認。新規OAuthや別実Google会員の比較ではない。

1. 既存15件の状態と未読6件を表示。未読のある6投稿に絞り、受付版1の結果を開く。読むだけでは通知6件を消さない。
2. menu再選択でqueryなしの一覧へ戻り、取消済みの既存投稿では上部案内・閲覧用内容を表示。
3. PCのguide下端と項目上端は719.70px、guideを開いた後も839.89pxで一致。スマホ幅でも731.61pxで一致し、重なりなし。
4. 確認用の非公開草稿1件だけを作成・保存し、外部確認/AI/公開を依頼せず取消を試験。dialogはPC幅480pxで画面中心、390×844では幅356pxで画面内。Escapeで戻ることも確認。
5. 同草稿の取消確定で一覧へ戻り、上部の完了案内がfocusを持ち、viewport上端から約16pxに表示。草稿は取消の記録として保持。
6. スマホ390pxに対して文書380px（dialog中390px）で横はみ出しなし。viewport設定解除済み。iPhone実機/キーボードの試験ではない。

## 保全・切替

追加migrationなし。会員000〜028・ledger29件、知識001/002/004のchecksumを再照合。fresh dump2本と直前build `6e-oR7REeDvKQEgoaaU1g` はprivate `.local/submission-repair/activation-backup-20261104T121356Z` に保持。認証・Google・KG・AI設定・reader/capture資格のhashは前後一致。

最初の切替準備はreaderの安全停止待ち30秒がHTTP待ち30秒＋poll待ちより短く、中断。Web/DBを切り替えず、reader終了を確認して停止待ちを60秒にし、未使用の生成stagingだけを整理して同じsource/buildで切替した。強制終了・checkpoint削除・推論の強制再実行はない。配置後にWebと4Workerの生存、localhost TOPとβ会員ページ200を確認。

## 別途指定された通信対処

利用者が指定した `cloudflared-resale-research` のみHTTP/2へ固定。Git管理外 `/home/isinxnisi/1.projects/9.local-compose-resale-tunnel/compose.yaml` のcloudflaredサービスへ `--protocol http2` を追加し、no-deps/pull neverで再作成。image/token/network/mounts/環境変数は維持。Windowsサービス・DB・他connectorは変更していない。

変更後の`protocol=http2`登録を実ログで確認。利用者提供の変更前QUICタイムアウトログと区別し、Plunode βの502と同一原因だとは断定しない。長時間安定性も未確認。初回にWindowsサービスを見た対象違いを訂正し、原因調査は広げない。

変更前定義と結果は本人専用 `~/.local/state/plunode-previews/resale-http2-20261104/` に退避。共有txtとUI確認画像は本人のCodex visualizations領域に置き、非公開会員画面・tokenをGitへ追加しない。
