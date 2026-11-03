# U6：有限資料取得とU5保存枠残件の確認（2026-11-04）

## 確認先・終了点

- [資料の収集](https://graph-beta.isinxnisi.com/operations#collection)。既存Googleの運営sessionで「収集を依頼」から名前・範囲・公開HTTPS URL（最大5）を指定する。PCのWorkerが取得し、一覧で資料ごとの結果・日時・hashを確認できる。
- いま成立したのは、有限依頼 → HTTPS API → PC取得 → artifactと配送checkpointの保存 → 結果表示・取消・再開。**U6全体は未完了**。読解・共通原記録への通常自動登録／公開・後追い意味整理・用途別AI枠の接続は残る。基本追加2〜3回の推定。U7統合受入・U8正式公開は別工程。
- 初版全体の到達点・登録負担を資料取得だけで満たしたとはしない。新規の課金、既存漫画Worker／共通Kev／AI教育・予定の変更は行っていない。

## U5から残っていたCapsule保存・共有

ユーザーの整理許可に基づき、βの検証用「U4確認｜年表の共有停止」1件をごみ箱へ移した（復元可能）。他のCapsuleを一括削除せず、独立した会話を消していない。保存枠が19/20になった後、新規「β確認｜U5投稿から年表を保存」を会員へ保存できた。投稿でTheme版2へ追加した時期なし背景「Webbの打ち上げ時刻は12:20 UTCだった。」も、年表・関係図とともに保存された。

[確認用の共有Capsule](https://graph-beta.isinxnisi.com/shared/J_Z5yWa9JdktlPVR_khkshsZYaH1CHj-7byhF48irBM)を発行して読み、名前を「β確認｜U5投稿から年表を保存・更新」に変えて保存版2へ進めた。保存後の共有URLは旧名・保存版1のまま、明示反映後は同じURLで新名・保存版2を読めた。元の背景・根拠も残っている。

サイトのHTMLメタは更新したtitle、Themeのdescription、同じ代表URL、画像/image/2を返し、画像は200/image/png。SNS側の表示は今回確認していない。U5の容量による新規保存・共有未確認は解消。一般AI提供の条件・対象拡大は引き続き未確定。

## U6実操作

既存の実Googleログインsessionを使った。新しいGoogle OAuthログインや、別の実Google会員との権限比較を行った確認ではない。

1. HTTPS βの運営画面から「β確認｜Webbの公開資料を取得」を作った。入力範囲は打ち上げと副鏡展開、NASAの指定2資料のみ。PCは認証付きoutbound HTTPSでjobを受け取り、各1回の取得で317079／257412 bytesを保存した。元body、抽出テキスト、取得日時、hashを保持し、画面は「資料取得完了」「取得済み」になった。
2. 新規capture Workerだけを正常停止し、Web／投稿審査／publisherを稼働したまま、別依頼「β確認｜取得待ちの取消」を保存した。画面の「PC側の取得待ち」から取消でき、同じ資格とcheckpointでWorkerを再開しても取り消した資料は取得されなかった（attempts0）。前の2取得artifactは保持された。
3. PC幅と390×844pxで操作した。390px viewport／document幅380px、横はみ出しなし。フォームは必要時に開く。実操作後、通報専用の説明と1ページだけの無効ページ送りを外し、補助表示の占有率を下げた。最終buildでも再確認し、390px viewport／document幅390pxで横はみ出しなし。
4. ACK喪失・期限切れ・取消中の遅着・部分失敗・credential境界は下記の実PG／署名OIDC fixture。実PCを再起動した試験とは区別する。ブラウザ接続はユーザーのChrome再起動で復旧した。

## 検証・移行

- 追加027。会員の53既存tableの旧列fingerprintをfresh dumpの別名DBで照合し、適用・再実行後も全行不変。知識14tableも別DB復元と再実行不変を確認。適用済み000〜026のchecksumは変更していない。会員は57table、ledger28。知識001/002/004のまま。
- 実PG＋署名OIDC 7件：本人・運営・Origin・worker credentialの境界、固定scopeと同request再送、本文hash／抽出一致、部分完了、旧lease／試行上限／取消、claimとcompleteのACK喪失を通したPC checkpoint、同時刻のページングと同時job上限。
- UIと回帰35件：収集フォーム3、原資料照合20、既存Capsule通報4、投稿相談8。表示圧縮後の関連UI3件も再実行。対象ESLint・全体型検査・production build成功。
- 初回の閉じ括弧、UIのrender中ref参照を修正。復元DBをadmin所有で作った初回はschema作成権限不足で停止し、その検証用DBのみ破棄。元のapp roleをownerにした別名DBで再実行した。テストのglobが.local内コピーへ展開された実行は中断し、引数を配列で渡して対象35件を再実行。liveをresetして回避していない。
- U6の実AI送信は0。配置時刻以降のreview_attempts増分も0。一般投稿の利用量・project枠・Gemini profileと、source-captureの固定取得上限を混同しない。

## 配置と保全

アプリsource `384e7d52e2f385e3ef79e07b56110c20d4254bbc`、最終build `j_2dRaRyCWvs0g0ek5zx7`。3200とHTTPS βへ反映し、3276は既存U4を保持。本番VPSは未変更。

初回027適用のbackupは `.local/submission-repair/activation-backup-20261103T234853Z`。最終切替のbackupは `/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/submission-repair/activation-backup-20261103T235732Z`。直前互換build `J6OdM8Bi3g49vc4XVRwiR` を保持。既存の認証・運営・Google・公開KG・AI設定のhashは初回切替前後で一致。capture用profileは新規の所有者限定fileで、資格はGitへ入れていない。新旧dumpでliveを巻き戻さず、027を読める資材・同じcheckpointで再開する。

再開手順は[β runbook](../runbooks/KNOWLEDGE_BETA.md#u6a資料取得worker)。作業branchはcodex/issue75-theme-foundation、検証済み差分をmainへFF受入。通常pushとAutopilot hold解放は最終報告へ記録する。
