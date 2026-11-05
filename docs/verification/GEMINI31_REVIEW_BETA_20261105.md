# Gemini 3.1 Flash-Liteの比較評価とβ採用（2026-11-05）

## 結果と確認先

Gemini 3.1 Flash-Liteをβの標準に採用した。待機していた同じ受付版2は、3.1での8回目の送信・NASA原資料の照合・同一性／重複照合を通り、「登録済みの知識です」まで完了した。評価だけで公開状態を書き換えていない。

- 本人の結果： https://graph-beta.isinxnisi.com/member/submissions?id=3ee28b84-30c2-4cfd-a60a-1e5b1fb0afa6
- 公開先： https://graph-beta.isinxnisi.com/?krecord=submission%3Ab68bc162-6a51-4282-8282-54381405332b%3Arecord%3A310d43a1a577fd4d
- アプリsource：298cebc798c7ae61b5271c56ea200cfba5a781bd
- build：GJ83iMCf0BBwsL-IlJzkJ
- main／localhost:3200／HTTPS β：反映済み。3276／正式VPS：未変更。
- 追加migrationなし。会員000〜029の30 ledger、知識001／002／004／005／006／007を維持。
- 機械可読結果：[67送信の評価と実queueの結果](assets/gemini31-review-20261105.json)。

R1全体は未完了。取込API・永続package／項目receipt・実配送、Entity原文訂正・固定版reader・翻訳文脈等の残件は、[再計画](../design/PLUNODE_IMPLEMENTATION_REPLAN_20261105.md)のまま維持する。今回のモデル比較を機能全体の完成に数えない。

## 無料枠と比較方法

実Googleログイン済みAI Studioのplunodeプロジェクトで、3.1の無料枠がRPM15／入力TPM250,000／RPD500であることを再確認した。3.5と同じ表示で、3.1の方が無料枠が大きいとは言わない。課金・プロジェクト・APIキー・共有Kev・DNS・Cloudflaredは変更していない。モデル情報の版は3.1-flash-lite-05-2026、推論のmodelVersionはgemini-3.1-flash-lite。

既存の20件＋独立40件を同じprompt・schema・thinking LOW・出力上限2048・API revision 2026-05-20で送信した。判定基準を結果に合わせて下げず、既存protocolの有効回答率95%以上、正常な支持あり投稿の受理候補率85%以上、高リスク誤受理候補0件を適用した。本文や資料中の指示はデータとして扱う。

| 項目 | 3.1 今回 | 3.5 以前の評価 |
| --- | --- | --- |
| ケース数 | 60 | 60 |
| 有効回答 | 58 | 59 |
| 正常な20件の受理候補 | 20 | 18 |
| 非受理想定の誤受理候補 | 0（38件回答、2件未判定） | 0（40件回答） |
| 有効回答の中央値 | 1,658ms | 1,131ms |
| 有効回答の最大 | 27,179ms | 58,206ms |
| 基本評価での通信失敗 | 429×1、503×1 | 応答不明を含む、過去63送信で59回答 |

3.5は別日・別の負荷状態での履歴であり、統制された同時A/B比較ではない。今回の結果から、3.1の方が速い、安定しているとは断定しない。受理の分類と支持判定のラベルが完全一致しない場合もあり、誤受理候補0は誤判定0の意味ではない。とくに「部分的に支持されるが不足」と「明示的に矛盾」の区別には誤りが残る。通常分の自動化は維持し、既存の補足依頼・相談経路を残す。

429は毎分上限の応答だった。待ち時間を守って送信間隔を6.2秒以上へ広げた。503後も78秒以上待って次の独立ケースへ進め、同じ失敗ケースの再送はしていない。HTTPエラーを内容不備や支持ありへ読み替えていない。

さらに次の7送信を実施し、すべて有効回答だった。

- 3.5で503が続いていた実投稿と同じwireを3.1で評価：1,731msで成功、既存の固定Recordを同じ知識と判定。対象の別IDは同一性対応で照合。
- 既存重複corpusの3例：翻訳は同じ知識、同じ両端でも異なる役割は別、候補内の指示で同じ知識へ統合しない。
- 翻訳の意味確認2例：忠実な否定文を支持し、否定が消えた翻訳を矛盾とする。
- 収集読解1例：仮想観測所の機器提供から、正しい両端・関係・2003-04-05と原文引用を抽出。

総計67送信／65受信。評価から公開・知識登録・投稿者活動の作成は行っていない。翻訳草稿の生成UI・収集の全経路・長文全般・全言語を、この追加6例だけで検証済みとはしない。

## 利用量の保全

すべて既存member DBのreview_attemptsへpurpose=evaluationとして原子的に予約・精算した。ローカルの別台帳で無料利用枠を迂回しない。実際に送信したmodel=gemini-3.1-flash-liteを同じprojectの行へ保存した。

今回だけの有限評価では、3.5由来かつRetry-Afterなしの503によるローカル待機を、project行ロック下で一時的に除き、予約後・commit前に元へ戻した。providerの429・Retry-After・日／月／分・token上限は除外しない。通常queueの停止時間は評価中そのまま保持した。一般的な自動fallbackや恒久的な待機迂回を実装したものではない。

65回答の実測は入力21,090、候補4,349、推論7,418、合計32,857 token。今回3.1は推論量も全65件で返した。429／503のtokenはnullのまま予約分を残し、0消費と偽装しない。raw response・送信wire・attempt IDはprivateな.local/gemini31-20261105へ0600で保持。再現用helperは.local/evaluate-31.ts、.local/evaluate-31-supplement.ts、集計は.local/summarize31.py。元のデータ・コード・wire hashと各判定は添付JSONへ記録した。

日／月／token／用途配分のPlunode上限は増やさず、標準送信のRPMだけ15から10へ下げた。採用確認時の当日利用は全モデル・全用途で79／80回、入力86,921／250,000、出力38,672／160,000。評価もこの79回に含む。追加確認で上限に達した場合は通常queueで翌利用日を待つ。太平洋時間の0時で切替（今回の次回は11月6日17時JST）で、モデル変更による回数リセットはしない。

## 配置と実queue

所有する5プロセス（Web・公開投影・投稿確認／翻訳・収集・収集読解）を停止し、会員／知識DBのdumpと旧build、旧private設定を保存した。追加DB移行はないため、新しい移行・dump復元試験を繰り返す必要はなく、直前R1cの復元・再実行検証を引き継ぐ。

停止中の全table指紋を照合し、コード切替では全行を保持。モデル切替ではreview_projectsの設定digest・ローカル待機と、対象jobの再開時刻／理由だけが変わった。その他の会員・コミュニティ・知識データは一致した。private設定8ファイルはbeta-review.jsonのmodel・RPM・確認日時を除き同一。backupは以下（秘密値・dumpは追跡しない）。

    .local/submission-repair/gemini31-activation-backup-20261105T130620Z

設定digestを明示照合して変更し、稼働中の設定を黙って差し替える挙動は追加しない。reviewConfigと起動時allowlistに3.1を追加し、3.5も既存履歴と明示設定用に残す。providerは変わらず、既存の本人同意先・投稿範囲を拡張していない。

停止していたjobは、最後の3.5応答が503／Retry-Afterなしと確認できた同じjobだけを再開した。過去7試行は消さず、8回目に3.1を記録。通常のqueue・原資料検証・最終transactionで2026-11-05T13:07:58Zにpublished／disposition=existingへ完了した。成功や公開状態を手動SQLで作成していない。provider応答の処理まで7,434ms、入力1,435／出力281（うち推論110）／合計1,716 token。

同じ知識だったため、元Recordは内容版2のまま。待機前に保存した元Record・objects・全revisions hash・contributions・Capsuleの比較がすべて一致した。保存済み断面や投稿者活動を増やしていない。公開receiptとNASA取得証明は保持した。

## 自動検証と実ブラウザ

- 会員・投稿・参照の実PostgreSQL／OIDC integration：56件成功（モデル指定／異モデル応答拒否の追加2件を含む）。
- Gemini HTTP／schema／重複の単体：29件成功。
- 変更TypeScriptのESLint、Python構文、diff check成功。
- 固定sourceのNext.js 16.3.8 production build成功（型検査を含む）。
- localhost:3200：HTTP200、配置buildを照合。
- HTTPS β・実Googleログイン：同じ受付版2が「接続の再試行待ち」から「登録済みの知識です」へ変わり、重複を増やさない説明を表示。
- 「登録済みの知識を開く」で別タブの通常Graphへ進み、2対象／1関係・内容版2・NASA根拠・本文・日付・訂正導線を確認。通知を既読にする操作はしていない。
- UI／CSSは変更しておらず、今回スマホ幅の全面再確認はしていない。画面保存はCDPの一時timeoutで保存できず、結果のDOM・DB・URLを記録した。

## 再開と残件

通常の再開は、mainで既存private設定を用い以下を実行する。共有サービスの再起動は不要。

    python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node

3.1の無料利用枠・モデル提供・品質は将来も固定とは扱わない。503と429の自動待機は維持する。3.5での過去の失敗をすべてモデル障害と断定せず、DNS等の過去診断も残す。今回成功したことで原因調査を再開せず、次のR1取込API実装へ戻る。無料利用量・共通budget・有限評価を維持し、課金や全件管理者承認へ置き換えない。
