# R3c 差分更新・入力経路・通し確認

2026-11-07。R3c実装・β反映済み、最終確認は未完了｜R3はcまで｜全体はR6まで。

確認先：[運営・資料の収集](https://graph-beta.isinxnisi.com/operations#collection)／[既存Theme版4](https://graph-beta.isinxnisi.com/?ktheme=u3%3Afbaa9ee12f288cfa%3Atheme&krev=4&kview=split)。Googleで運営ログインし、「パッケージから登録」を開く。JSON貼付→内容確認→受付と結果の欄を追加した。PC／スマホの実画面確認は下記の理由で残る。

配置source `8ebd580eb90ea6cd6a6fe63d7ce2f84ef2c2a3a1`、build `T2REsZ0j7OT8ieC_nrXcn`。main／localhost:3200／HTTPS βへ反映。VPSは変更していない。

## 今回の変更

- 計画単位の資料本文・取得hash・前回取得との比較、本文／HTMLだけの変更の区別。
- 実行snapshotのRecord固定版と理由を指定する明示訂正。使用資料のobserveを必須にし、共通の原文照合・確認・意味重複・現在権限を通す。異言語の事実文と引用のtextLanguagesを保持する。
- Entityを持たないThemeの背景収集。無関係なEntityを作って収集を開始する操作を要求しない。
- 任意の運営Web貼付。元JSONを保存し、専用namespaceへ変換。内容確認・受付・結果・公開先・未反映の取消を同じ欄で扱う。受付後の断絶は既存review Workerが同じreceiptへ回復する。

[設計](../design/KNOWLEDGE_MISSIONS_R3.md)／[探索手順](../runbooks/KNOWLEDGE_MISSION_RESEARCH.md)。

## 検証済みと残件

隔離DBのmission／client／UI／配置61件、既存取込37件、対象lintを確認。固定Record版の明示訂正、旧本文・原語の保持、範囲外訂正拒否、資料原文の旧版保持、HTMLのみの差、停止・期限・世代・再送、Web受付のACK喪失回復を含む。AI応答はfixtureであり、実Geminiの成功とは扱わない。

型検査込みbuild成功。最終buildは44.7秒、Node heap 3072MiB、Windows Cの最低実空き9,290,788,864byte。最初のbuildは94.2秒。理由のない全件AI完了待ち・全評価のやり直しは行っていない。

会員034を追加。既存73テーブル・適用済み34件のledgerから35件へ進め、既存行・checksum・再実行不変を確認。会員dump 6,303,907byte、知識dump 178,923,021byteをprivateに保持。会員dumpを別DBへ復元し、同じ移行・保全を確認してから稼働DBへ適用した。知識DBはmigrationせず、原本3テーブルのfingerprintを比較した。巨大な可変cacheの全文集約は行っていない。

初回の復元検証では `--no-owner --no-acl` によりアプリ用roleが復元先schemaを読めず停止した。稼働DBへ適用する前に元のWeb／Workerを復帰し、所有者とACLを保持する復元へ修正して成功。失敗した配置用stagingだけを検証して除去し、dumpや既存データは保持した。15のprivate設定・資格はhash一致、共通Kev・他プロジェクトのコンテナ・正式VPSは変更していない。

HTTPでは3200とHTTPS βのTOP／operationsが200、Web貼付APIの匿名GETが401、固定Theme版4が14記録のまま200。識別可能な `Plunode-ReleaseCheck/1.0` を使用。Python標準UAではCloudflare 1010／403だったため、それをアプリの認証失敗と混同していない。画面の操作確認とは区別する。

## 実資料APIの確認

[NASAの元資料](https://science.nasa.gov/blogs/webb/2021/12/30/webbs-aft-momentum-flap-deployed/)をサーバーの安全な取得器で取得し、本文hash `bff32dfc23dd6979245a6a4d8dc1a3df322b0ff19bdf1486125d32d0c752e821` と圧縮原文をprivate DBへ保持した。異なる2回のHTML hashでも本文hashが同じであることを確認。事実文ja・資料箇所en・原文引用enを補う明示訂正をβの実配送APIで受付した。計画作成は既存の設定済みactive operatorを照合する内側のfixtureであり、Googleブラウザ認証の確認ではない。

- receipt `34239245-cab9-4506-837d-6bb42ad0e31e`：原資料照合後、外部確認がtimeout・送信結果不明。利用1回を保持。
- 診断scriptを読み込むつもりで再実行し、追加の確認計画を作ってしまった。receipt `fa4d43a4-336e-425f-aacc-6ff4e2935c7c` はHTTP 503。追加計画も停止し、scriptは明示phaseを指定できるよう修正した。利用1回を保持し、成功や未使用扱いにしていない。

確認用2計画はいずれも停止、未反映項目はcancelledを確認。通常のWebb日次計画はrevision6・active・既存のnextDueを維持。元Record版1・Theme版4／14件は不変で、今回の実公開・原語更新の成功とは報告しない。[機械可読の記録](KNOWLEDGE_MISSIONS_R3C_20261107.json)。

ブラウザ確認用のWindows制御が「現在のブラウザURLを安全に判定できない」として当該ターンのComputer Useを停止した。その後の画面操作や別手段による迂回は行わない。Chrome再起動で直ると判明した障害ではない。

残件：実資料の訂正で外部確認→公開が成功すること、登録→訂正→検索・年表→Capsuleの固定版／更新の一巡、異種の二つ目のテーマ、Web貼付を含むPC／390pxの実画面。R3bの実予定実行2件をR3cの新経路の確認済みに転用しない。R3c全体完了・R4着手とはまだしない。

## 次の再開

Chromeでβを開いた状態から操作接続を確認する。停止した当該ターンのComputer Useを別手段で迂回しない。実Googleで任意のWeb貼付→結果・取消を確認し、外部確認の回復後に明示訂正とCapsuleまでを一巡する。確認用の停止計画や旧leaseを再開して回避しない。予定実行と元の日次計画はすでに接続済みなので、作り直しや新しいtoken発行は不要。
