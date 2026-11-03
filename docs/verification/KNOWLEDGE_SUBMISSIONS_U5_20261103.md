> 後続更新：この記録はKev比較時点の結果。ユーザーの補足後、[Gemini評価と通常自動受理への接続方針](KNOWLEDGE_GEMINI_U5_20261103.md)を追加した。以下の「外部送信0」「自動受理は無効」「4B候補」は当該比較時点を表す。

# U5着手：投稿データ層と実Kev比較評価

2026-11-03。[設計・残件](../design/KNOWLEDGE_SUBMISSIONS_U5.md)。U5全体は未完了。今回、新しい利用者向け確認画面はない。以下を、投稿・実AI審査・本線受理が一巡した記録と扱わない。

## 出発点と保全

- main／作業branchの出発点 `c49a7f2577b38ac1fb98aba9460f2a80158940e5`。U4アプリsource `37ef826c287698e4b29791ab14b9649d15e3d13e`。
- branch `codex/issue75-theme-foundation`、worktree `/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation`。mainの未追跡`memo.txt`を保護。
- 開始時の共通ロックは収集Worker側セッションが保持していた。変更・検証を行わず読取調査を進め、解放後に自分の120分hold・token reviewを取得した。無関係な自動開発候補を取り込んでいない。
- 既存知識・会員・Capsule・コミュニティ・KGのDBには今回のmigrationを適用しない。新規テストDBだけで003を適用・復元・再適用した。

## 実AIの開発評価

`data/knowledge-review-cases.json`の手作業で期待値を付けた仮想20件を使用。短い作品名、教材名、正常な引用、専門語、具体的な関係、曖昧な時期、荒らし4件、根拠欠落、URLだけ、矛盾、部分支持、資料中の指示、限定の逸脱、英語1件を含む。

多肢形式の結果を見て簡単な二択形式も作ったため、これは**開発評価**であり独立holdoutではない。同じ形式の0.8Bと4Bには同じ順序のJSON bytesを送信し、全20件のwire SHA256一致を確認。無限のprompt調整・モデル自動fallback・課金APIは使っていない。

| 実行モデル・形式 | 投稿適否の期待値一致 | 提示抜粋の支持の一致 | HTTP時間合計／中央値 |
| --- | --- | --- | --- |
| 0.8B FP32・多肢 | 4/20 | 9/20 | 45.8秒／2.012秒 |
| 0.8B FP32・二択 | 7/20 | 16/20 | 28.897秒／1.403秒 |
| 4B NF4・多肢 | 17/20 | 18/20 | 224.562秒／11.372秒 |
| 4B NF4・二択 | 20/20 | 18/20 | 229.527秒／11.192秒 |

多肢形式の支持はsupported／unsupported／contradicted／unclear、二択はsupported／それ以外であり、支持の一致数を同一分類課題の精度として単純比較しない。仮想期待値自体も本物の資料の支持確認を代用しない。

4B二択は正常16件を荒らし扱いせず、荒らし4件も除外した。支持は宣伝文と罵倒文の2件で誤ったが、投稿適否では両方を除外。4B多肢は正常な引用・部分支持・広すぎる限定の投稿適否をunclearにし、正常をabuseにはしなかった。支持の誤りは宣伝文をsupported、背景だけの資料をunclearではなくunsupportedとしたもの。

自動受理は無効のまま。4Bを本番承認モデルへ採用した意味ではない。実資料の取得・抜粋の照合・事実全体の検証、独立holdout・順序感度・長文・多言語・実利用者入力は残る。

モデル識別・ケース別期待値／確率／時間／wire・response SHA256／サービス報告usageは[結果JSON](assets/knowledge-review-u5-20261103.json)。0.8Bは `bf75a6a8848ea6960ff2ed108d9ed44c2941174f`、4Bは `6cfce5c2fa4b4bd64026336ab649c5ca78857d52`、上流code `5e42a7a03f28134853dd3ff77461457e921e5ec1`。4Bは公式adapter・非量子化部FP16／NF4演算・head・adapter FP32の既存実験で、4B FP32との量子化差は測っていない。

推論は比較80回と復帰確認1回。APIの報告tokenはローカルサービスのカウンターであり課金請求ではない。比較分の報告入力18,740／出力9,961 token、別途復帰確認1回。未知の使用量を0とする処理は追加していない。今回、新しい課金・外部AIへの送信は0。

## 共有サービスの一時停止と復帰

ユーザーへ他プロジェクトの自動Workerも0.8Bを使う点を説明し、約10〜20分の一時停止を含む評価の承認を得た。`scripts/evaluate-knowledge-kev4.py`で既存コンテナだけをstop/startし、build・download・再作成・設定変更・共有network変更を行っていない。旧Kev実験のreportsは上書きしない。

- セッション 2026-11-03 15:27:10〜15:40:03 JST（約12分52秒、起動・評価・復帰を含む）。最高GPU温度86℃、GPU全体使用量peak 5,767 MiB。92℃または有限の実行期限で中断・復帰する監督を付けた。
- 0.8BコンテナID `745c5f881ed3af4ca18049b6868f1968d2a7ffbc56d1b29851d538142c7dcdcc`、image `sha256:b5b1dcd8fa386e60744f213c3a7ba4b4916adace3372333f6694c8c9c6157d12`。終了時に同一ID・image・Config・HostConfig・mountを確認。
- 4B image `sha256:b8dc50d04d3875212fafa971a184376e1929311c7629ecb5c92a944976ddb6d2`、同じ既存実験コンテナを起動して最後は停止。モデルcacheを削除しない。
- Kevソース・設定・実験資材・旧reportsの44ファイルの前後SHA256一致。復帰runtime一致、元0.8Bで200の実推論を確認（3.884秒）。
- 評価中は共通APIが使えないため他利用者のAI要求が失敗する可能性があった。別プロジェクトのjobやDBを再実行・修正していない。該当時間のresale web／workerコンテナログでKev関連行は0件だったが、個別業務の結果監査を完了した意味ではない。

監督失敗でも同じ0.8Bへ戻ること、既存の評価出力を上書きせず停止前に拒否することを、実サービスを動かさないPython unit 2件で確認した。今回の許可を定期的な共有停止・恒久4B切替へ広げない。

## データ層の検証

- 新規schema・review出力の検査5件と、実PGの6件、計11件成功。owner分離、再送、異なる同一request ID、同時編集、提出版と元文字列の保持、古い操作の再送、取消後の再提出拒否、既存Record無変更を確認。
- 専用container `plunode-issue75-postgres`に、今回生成した `plunode_knowledge75_test_u5_…` とその復元DBだけを作成。custom dumpを別DBへ復元し12テーブルのfingerprint一致、003再適用で不変を確認。生成したDBだけを終了時にdropした。dumpは `.local/u5-submissions/c2ecd6d4d9124284/` に保持（後の再検証分は同ディレクトリ配下の別ID）。
- 関連domainの回帰は23件成功／DB接続なしの既存21件skip。新しいPG経路の検証をこのskipへ置き換えていない。
- TypeScript `tsc --noEmit`、変更TSのESLint、Python unitを確認する。実会員認証・停止／退会・Capsule選択・画面操作・非同期job・課金予算予約・受理／一部受理・通知は未接続。

再検証：作業worktreeで `.local/issue75/node`を用い `python3 scripts/test-knowledge-submissions.py`。既存専用PGのlabelとprivate runtimeを検査し、作成したテストDBだけを操作する。`python3 -m unittest discover -s tests -p test_knowledge_kev4_session.py -v`は実Dockerを触らない。

AI評価CLIの再採点は同じ`--output`・`--profile`と`--offline`を指定する。保存済みresponseとruntimeだけを読み、4B停止中でも推論せず再採点できる。送信済み・応答不明や異なるwire・モデル版は拒否し、自動再送しない。4Bの実起動は共有停止を伴うため、改めて認められた評価窓でのみ `scripts/evaluate-knowledge-kev4.py --allow-shared-pause --output .local/新しい評価先` を使う。既存出力の削除によるやり直しはしない。

## 配置・残件

今回は未接続の内部部品・評価資材で、作業branchへ保存する。main、3200、HTTPS β、3276の実行物を切り替えない。U4の確認先は引き続き利用でき、3200／β build `UV072kqFJC_JqEMIyOme6`、3276 build `vR5VoLRV33qIhkrJpHFnF`。本番VPSを更新していない。

3200／3276のTOPはHTTP 200。HTTPS βは初回のPython既定UAで403、その後通常ブラウザ相当UAのTOP・公開テーマAPIは200。Chromeの既存GoogleセッションでTOPを再読込し、紹介／新着テーマと既存アカウント表示を確認、再読込前にあった古い`Failed to fetch`表示も消えた。Tunnel・Cloudflare・Windowsサービスの設定や起動状態は変更していない。新しい投稿機能の実ブラウザ確認ではない。

次は[U5設計の残件](../design/KNOWLEDGE_SUBMISSIONS_U5.md#次の実装u5を完了するために必要)。基本2〜3回以上の追加指示を推定し、まず実会員の受付／修正／取消をβへ接続する。審査を全件手動へ変更する、未評価の自動受理を有効にする、4Bを常駐させる、といった決定はしていない。
