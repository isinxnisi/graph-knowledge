# Issue #54 検証・配置記録

2026-10-28。実装基点はmain `89ea84b4c35ba62d196364d2078995ccbf376b5d`。自動開発の未反映0件、dirtyは既存memo.txtのみと確認。共通holdは01:47:57 JSTから取得。memo・自動開発branch・Worker・KG／会員DBを変更していない。

## 配置前の境界

本番は映画公開済みWeb build `oTXBAgU034CoviTmmAHQ9`／image `sha256:afaa4a8203e757f5a604c08653a83f4944856717d1cafc45af3be8c1d000e65d`。公開revision `7c54da24-6fa9-46a5-810d-834eed8328d9`をHTTPSで再確認した。mainと本番コード基点4eee46a0のapp/components/lib差分は、beta専用7697接続許可だけ。別機能の未公開変更を混入していない。

betaは映画の正式確認DB7697／revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`。元7694・試験7696は保持。本番との差を同期で消さない。専用管理Web／Cloudflare Connector／Caddy／通知serviceは維持する。

## DB性能・正しさ

専用Neo4j5.26.31、heap512MiB／pagecache256MiB／container1.5GiB。2205 Entity／3114 Claim、起点1102 distinct接続先、重複Claim30、条件付き2段、否定／非公開／制作Roleを含む合成fixture。DB初回起動後の最初のquery compilationとwarmを分離した。200候補の測定は同一プロセスで1000候補の後なので、coldとは呼ばない。

| 方式 | 最初の要求 | warm 3回 | 追加ページ | 4並行全体 |
| --- | ---: | --- | ---: | ---: |
| 従来ID順 | 4788ms | 220／158／134ms | 1789ms | 251ms |
| 1000候補×50 | 6752ms | 481／561／563ms | 1929ms | 513ms |
| 200候補×50 | 299ms（既存query plan） | 365／482／289ms | 259ms | 433ms |

初回20 Claimが20接続先を含むこと、score上限同点のID順、全1132 Claimを最後まで重複・欠落なく取得、上限外候補の到達、旧cursor継続、条件による順位変更、空Role、否定・hiddenの扱い、条件／設定不一致拒否を検証。保存互換の追加テストでは明示ID順の初回・新cursorとの混在拒否・operator切替を確認した。

PROFILEのdbHitsは従来5099、評価1000候補32005、評価200候補15205、順位付きページ15278。200候補は従来よりDB仕事量が増えるが、上限内の追加取得／並行要求は1秒未満、最大単一要求は既存10秒未満。接続50は維持し、候補200を既定として採用。評価の精度は範囲内に限り、範囲外の高次数候補を最初に出せる保証はない。

DBの測定終了時RSS相当container使用量は757〜797MiB／1.5GiB、待機時CPU1.5%前後。実行中ピークの継続採取はしていない。VPSそのものの負荷と同一だとは扱わない。

最終imageを別ポート3288で起動し、beta7697へREAD接続した。浦沢直樹17 Claim／PLUTO6 Claimが従来順と同じ証拠集合、revision保持。評価queryの初回は3067ms、PLUTOは128ms。[image API](../research/neighbor-priority-20261028/image-api.json)。

実betaの最大次数起点University of Tokyo（970 Claim）では、200候補のwarm220／153／134ms、追加882ms、4並行全体368ms。従来はwarm58／70／71ms、追加423ms、4並行91ms。追加の計算コストはあるが実用確認枠1秒内、既存DB timeout10秒内。相対倍率だけを性能向上と表現しない。[実測](../research/neighbor-priority-20261028/beta-high-degree-performance.json)。本番では同じ負荷試験を反復せず、代表GETとサービス状態を確認する。

## 検証の経過と再実行

- 関連8 fileの初回221件中220成功。残りは待機時にボタン文言を変えなくしたことに伴う既存期待値1件。更新後、影響する3 file108件成功。
- 保存互換の追加後、関連5 file112件中111成功。凍結版のmock呼出し引数へ不要なnullを追加した1件を修正し、そのケースだけ再実行して成功。新旧保存URLの方式保持テストも成功。
- DB統合の初回は条件を順に確認するテストの5秒枠を超過（単一DB要求のtimeoutではない）。複数要求を含むケースのテスト枠を60秒にし、候補200との比較を加えた最終3件が成功（74.65秒）。保存互換追加の1件だけ別実行し成功（26.81秒）。初回の一括成功とは報告しない。
- host型検査でHTTP戻り値の推論不足を検出し、adjacent専用の型を明示。最終host tscとimage内Next build型検査が成功。変更TS／TSX lint・Bash構文・Node24のproxy構文・diff checkが成功。
- buildは互換モード追加前の一回、追加後の型エラー一回があり、どちらも未配置。修正後の最終imageだけを配置対象にする。依存cacheを再利用し、betaと本番で同じ最終image由来buildを使用する。

全test／全既存E2E、会員の新規ログイン・書込み、VPSのDB停止・再投入は行わない。変更と無関係の全スイート反復を避ける。

## 最終反映

betaの実画面で、通常のEntityリンクも旧保存の再生として扱われる経路を検出した。裸のリンクと新しい検索結果の引継ぎにboundedを明示し、旧保存との区別を修正した。関連14件、追加した入口回帰2件、型・lint・buildが成功。従来の経路証拠付きリンクはID順を保持する。この修正のため追加buildを行った。

最終image `graph-knowledge-web:issue54-20261028`／config ID `sha256:72a255c9972cc994bf329afa4e883f48fd82612db1ab9684a9fee3054d59d66b`／build `RGTfxR5GC6MqFk7_T4bXw`。初回beta配置の`JPatRyz3_uulQXlSG-62x`は入口修正前の版として区別し、本番候補にしない。

ローカル3287のGET専用proxyで、8秒遅延、503、409を模擬した。Entity4／Claim6を保持したまま対象名付き待機、503時Entity12／Claim21保持、再試行でClaim23へ復帰、409時Entity12／Claim27保持、明示読み直しで起点へ復帰を実画面で確認。390px幅の[待機表示](../research/neighbor-priority-20261028/mobile-loading.png)は小さな通知で、Graphを覆う大きなモーダルを追加していない。DBへ障害やrevision変更を起こした試験ではない。

現時点ではbeta実画面・本番用bundle準備中。VPS developのsudoはpasswordを要求するため、準備・検証完了後の管理者一括コマンドが必要。未反映を反映済みと扱わない。

## 工程時間

hold開始01:47:57 JST。準備・変更・単体／型／lint・DB統合・ブラウザ・build・3200／beta・commit／pushを分けて終了時に追記する。並行した工程の経過時間は単純合計しない。
