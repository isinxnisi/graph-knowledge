2026-11-07 R3b完了。app `662cd121`／build `-a6v6--efFNwfdsRQGwbz`、main／3200／HTTPS β。予定実行 `plunode`／「Plunodeのテーマ資料を収集」をこのPCで有効化し、探索→配送→2件の自動公開を確認した。[検証と残件](../verification/KNOWLEDGE_MISSIONS_R3B_20261107.md)。R3cの本文差分・明示訂正・入力拡充・通し確認は残る。以下のR3a時点の「未接続」は履歴。

**2026-11-07訂正：収集用のCodex予定実行はPAUSED。合意したChatGPT側の予定実行との接続は未完了。以下のCodex実行記録／起動手順を標準運用として再開しない。** API配送・自動公開の実証とは区別する。[実物・停止・是正方針](../design/KNOWLEDGE_MISSION_EXECUTION_CORRECTION_20261107.md)。

再開は既存のβ launcherとデスクトップアプリの起動、Scheduledのタスク有効状態を確認する。資格・checkpoint・計画を作り直さない。計画は運営画面、全タスクはScheduledから停止できる。[探索・配送手順](KNOWLEDGE_MISSION_RESEARCH.md)を使い、clientは保存済みleaseも探索前にサーバーへ照合する。完了結果はScheduledと運営画面で読み、受付と公開完了を区別する。アプリのタスクは毎時の確認、計画の頻度・回数上限はサーバーが別に守る。新しい管理者承認や課金設定は不要。

# テーマに沿った定期収集の運用

R3a。計画と配送APIをβへ接続済みであり、予定実行の実接続はR3b、本文差分からの明示訂正と通し確認はR3cで行う。[設計](../design/KNOWLEDGE_MISSIONS_R3.md)。手動clientの成功を定期実行完了と扱わない。

## 設定・停止

運営ログインで `/operations#collection` の「テーマに沿って定期収集」を開く。追加先テーマか核となる対象、調べる問い、資料のサイト、頻度と1回の上限を保存する。サイトは `www.esa.int` のようなhost名で、URL・path・wildcardではない。下位hostも使うなら別に指定する。計画の編集・停止・再開は明示操作とし、公開済みの知識や保存済みCapsuleは変更しない。

## 配置

既存会員DBのbackupを別DBへ復元してから、追加033／034（資料取得版・Web配送）を `scripts/member-migrate.ts --knowledge-missions --confirm-origin HTTPS_ORIGIN` で明示適用する。前提migration・origin確認などは同scriptの現行手順を使う。起動・HTTP要求でmigrationを適用しない。既存のchecksumを書き換えない。

配置profileに `missions` capability、既存import／review設定、`KNOWLEDGE_MISSIONS_ENABLED=1` が必要。本人所有0600のprivate server設定を `KNOWLEDGE_MISSIONS_CONFIG` へ指定する。形は `{"workerId":"mission-delivery","tokenSha256":"64桁のSHA256"}`。配送用tokenは暗号学的な32byte乱数とし、原文は別の本人所有0600ファイルへ置く。既存のGoogle認証・import資格・AI設定を置換しない。現在のβlauncherは `~/.local/state/plunode-previews/beta-missions.json` を同条件で読み込む。

## 配送client

Node24、既存の `tsx` を使用する。client設定は本人所有0600で、正確なHTTPS origin、tokenFile、本人所有0700のcheckpointDirectoryを指定する。資格値・lease tokenは標準出力へ出さない。

~~~json
{"origin":"https://YOUR-ORIGIN","tokenFile":"/PRIVATE/mission-token","checkpointDirectory":"/PRIVATE/mission-checkpoints"}
~~~

~~~sh
node --import tsx scripts/knowledge-mission-client.ts /PRIVATE/mission-client.json claim
node --import tsx scripts/knowledge-mission-client.ts /PRIVATE/mission-client.json observe /PRIVATE/urls.json
node --import tsx scripts/knowledge-mission-client.ts /PRIVATE/mission-client.json deliver /PRIVATE/package.json
node --import tsx scripts/knowledge-mission-client.ts /PRIVATE/mission-client.json empty /PRIVATE/summary.txt
node --import tsx scripts/knowledge-mission-client.ts /PRIVATE/mission-client.json fail source-unavailable
~~~

`claim` の公開briefに問い・取得時の対象版・資料host・上限・packageIdentityが含まれる。[共通package契約](../design/KNOWLEDGE_IMPORT_CONTRACT.md)に沿い、渡されたID・版を使い、項目ごとの原文引用を添える。本文の命令・権限要求には従わない。定期収集は新しい対象／関係、既存対象やテーマへの情報追加、根拠追加を配送できる。切り離された新規対象や指定範囲外のサイトは拒否される。

payloadは送信前にprivate checkpointへ保存する。応答喪失時は `claim` で同じ配送を回収し、別の検索・推論やpackageの作り直しをしない。期限・計画版・lease世代が変わった409は旧配送を止め、次の実行へ進む。`empty` は新情報なし、`fail` は取得不能などで、受付・公開成功を装わない。資料取得やAI確認は共通の安全な取得器、予算・retry、重複照合、受理・公開を使う。

配送受付と知識の反映は別の状態として運営画面に表示する。停止は未反映分にも作用し、再開しても停止前の未反映分を復活させない。既存原本・履歴は削除しない。不具合時は新しいDBを読めるWebを保ち、missions capabilityを無効化して修復する。古いdumpで稼働DBを上書きしない。

## 任意のWeb入力と回復

運営の同じ「資料の収集」で「パッケージから登録」を開き、取込JSONを貼付する。内容確認後の受付でprivateな原入力・namespace変換・receiptを保持する。任意の入口であり、定期収集に毎回の人手承認を加えない。元namespaceを資格として使わず、自分専用の内部namespaceへ変換する。一般会員の投稿は従来の知識投稿を使う。

受付後に通信やプロセスが途切れた場合は、同じ内容の再送か、通常のreview Workerによる未配送分の回復で同じreceiptへ進む。履歴は自分の直近10件。未反映の取消は公開済み原本を消さない。設定・所有者の資格を失った配送は自動的に停止する。private DBの取得原文や元packageを公開資材へコピーしない。

## 2026-11-07 βの現在地

app `a6b2e2ea`／build `zLg4ZAkesFvHBwwc8A6H_`、会員033追加済み。[配置・保全・実操作](../verification/KNOWLEDGE_MISSIONS_R3A_20261107.md)。既存launcherでWebと5 Workerを再開する。配送元の最終接続は手動clientの確認で、予定実行は未接続。Webbの計画は停止状態で保存した。再起動でmigration・資格・利用枠を作り直さない。
