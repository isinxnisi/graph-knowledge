# β：黒澤映画と『スター・ウォーズ』の原資料取得補修（2026-11-13）

## 対象と結果

- requestId `f554935a-bcb2-4d67-b01f-bfb90377f456`、receipt `4cab5e05-a788-4173-b058-aa5df22a1b57` の同じ受付を使用。新規テーマ／再受付を作成していない。
- 調査・修正・β通常処理の確認という3工程を実施。通信補修は配置済みだが、全項目の資料確認・審査・テーマ公開の完了ではない。
- 通常のβ確認Workerで G01／G04／G03／G02／G05 の5項目は原資料・抜粋照合を通過。その後のAI予算予約で、既存projectの「自動整理の接続が一時的に利用できません」という共通pauseを返され待機。AI送信は0回のまま。
- G07はCriterionのHTTP 403／`cf-mitigated: challenge`。Cloudflare認証ページを原資料本文として扱わず、一時的な取得制限として再試行待ち。ブラウザ認証の迂回や別内容への差し替えは実施していない。
- T01／T02／D02／T03の「対象・関係・テーマを選んでください」は入力不足。今回変更せず、接続失敗に含めない。

## 原因と修正

調査開始時は6項目ともprepare_attempts=8、日次の準備再試行上限待ち。AI用attemptは0件。原資料関数を直接再現すると、DNS解決後のWSL Node HTTPSが全5サイトで約10秒の`AbortError / ABORT_ERR`になった。Windows側の同じ接続先へは応答が返る。前工程で導入済みのβ限定Windows HTTPS transportが、原資料取得には接続されていなかった。

`publicSourceDocument`からも、明示的に有効にしたβ限定transportを使用するよう接続。Windows側も既存と同一の `Plunode-SourceCheck/1.0` User-Agent／Acceptを使用する。匿名GET、TLS検証、DNS確認とIP固定、転送ごとの再検証、HTTPS／公開IP制限、最大3転送／2MB／時間上限、HTML・textの文字コード読取、原文抜粋の完全一致とhash生成を保持する。添付画像のhost許可を一般の資料サイトへ広げていない。本番originではこのtransportを有効化できない。

通常の403は従来通りURL確認を要するが、明示的なCloudflare challengeは入力不備とせず一時待ちとして区別した。Windows curlの容量超過も通信障害として再試行せず、従来の資料容量エラーへ戻す。

## 実取得と通常処理の区別

修正後の原資料関数による実取得：

| 資料 | 本文サイズ | 抜粋照合・通常Worker |
|---|---:|---|
| JFDB `/title/7516` | 34,313 bytes | G01／G04を通常Workerで照合通過 |
| Lucasfilm `/productions/episode-iv/` | 80,690 bytes | G03を通常Workerで照合通過 |
| 国立映画アーカイブ `det.php?data_id=622` | 9,582 bytes | G02／G05を通常Workerで照合通過 |
| Criterion Lucasインタビュー紹介 | 一度69,138 bytesで一致、その後403 | 通常WorkerはG07を403 challengeで待機。安定取得成功とはしない |

StarWars.comの別資料は約3.3MBで従来の2MB上限を超える。今回の取得対象6項目では使われておらず、入力不足4項目の資料の一つ。容量上限を緩めて通していない。

5項目の通常処理通過は、`prepare()`内の実取得・引用照合を全て終えた後だけ実行される `reserveKnowledgeAI` の既存project pause応答に到達したことで確認した。AI予約に達していないG07と区別する。pause時はAI attempt／proofレコードが作成されないため、保存済みAI審査結果・公開成功の証拠とはしない。

通信補修後の確認のため、β確認Workerのみを止め、対象6項目に準備再試行を各1回だけ許容して同じ通常queueへ戻した。失敗前の全行を私有baselineへ保存し、prepare_attemptsを8→7にした。G07にはchallenge分類修正後の再確認をさらに1回許容した。AI利用量・送信attempt・判定はリセットせず、抜粋照合／通常審査を省略しない。追加の予算付与・他受付の再試行操作はしていない。

## 保全・配置・検証

- 10項目のnormalized／input_digest、テーマinput（画像参照を含む）と4入力不足項目の状態・理由が同一であることを照合。
- 既存商品・画像の削除／差し替えなし。DB migration、外部AI設定変更、本番配置、正式App・予定実行設定変更なし。
- 40件の検証成功：原資料照合・native通信境界・βtransport・URL／IP／転送／容量／403・503／引用不一致。対象ファイルeslint、型検査込み公開build成功。
- build `DQjHhCsjCwWG7qI0Gmvdm` をmainソースから3200へ配置。localhost／HTTPS β TOPとも200、既存β Appの `get_theme_registration` で同じ受付・画像ID・待機理由を再確認。
- ブラウザの画面・iPhone実機による追加表示検証は未実施。今回はUI変更なし。

残件：Criterionの安定した匿名取得、共通AI接続待機後の通常審査、および4項目の投稿入力修正。いずれも完了扱いにしない。外部AI接続pauseの修正・解除は本件では行っていない。

## 本人指示によるG07の単発再試行（11月13日04:27 JST）

同じrequest／receiptのG07だけを、コードから通常queueへ1回再開した。上限待ちprepare_attempts=8から7へ今回分だけ変更し、受付input・画像／商品・既存結果・AI利用枠は変更していない。開始時点の全行を私有baselineへ保持した。

04:27 JSTの取得もCloudflareの403 challengeで失敗し、`原資料サイトの自動取得制限により本文を確認できません。時間をおいて再試行します。` を確認。登録未完了。原資料取得自体にAI審査はなく、今回の説明に後続処理の話を混ぜたのは不適切だった。取得本文の差し替えや、照合／審査の強制通過はしていない。コード変更・再build・本番反映なし。
