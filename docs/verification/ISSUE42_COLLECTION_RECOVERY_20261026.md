# Issue #42 継続収集の設計改善・隔離検証（2026-10-26）

## 到達点と非実施

通信の技術的未完了を意味保留／completedへ畳み込む経路を分離し、消費台帳を保持した有界復旧と通常版「第1集」を実装した。実運用Worker配置・設定・Windows task・旧依頼再実行・追加NDL/Wikidata通信・正式受入・公開apply・VPS・会員DBの変更は実施していない。Issue #42の実対象は依然として旧版resultでcompleted／3保留の記録を保持する。隔離試験の成功を実Workerの復旧完了と扱わない。

## 実配置とmainの差分

調査起点main `05200a17fc2ded39b2e7a97597ca12d886f8e9f5`。実配置の互換基準configは `973c7b0c599f79905a029b28b524f4924e169376` だが、レビュー済みbackportがある。

| module | 調査した実配置SHA-256 | mainとの差 |
|---|---|---|
| collection-worker.py | d5720b662bbcb794d9079f67a0cec39e18e8d938b094615a02c181e298fd77c4 | 今回変更前mainと同一、973と異なる |
| collection-issues.py | 9e0231ab0f444e181e6672d28759b729c108ae2d7816915789a794ba1465656e | 同上、#16等のbackport |
| collection-workflow.py | 4cf976114b8b4f79bdb3f5e8f1573db91cbfd395080f4fae75e79fafbc1e704e | main／973の両方と異なる、#5の限定的参照closure修正 |
| collection-worker-control.py | 23eeb89cc05da240b2f0fe4f6666dcd4db66b7f0d2d38261e5e71c96cb85d314 | main／973と同一 |
| collect-manga.py | a52864e69386c12e32c62fe5a0bbf7ce6573f8c736acceac1ccd0c1a16dca7cd | main／973と同一・変更せず |
| collect-manga-v2.py | d887d490159b03a1d0b90dba060f6d77e248c1d7308497c0adb3d3048bf60f88 | main／973と同一・変更せず |
| collection-recovery.py | 50ad2eab9be3f38e9f402ee88166d76f53da85c4975137582eaecd206ed42043 | main／973と同一・従来UTC専用復旧を維持 |

Node24はprivate配置、runtime/node_modulesはmain依存へのsymlink。NDL取得は標準Pythonであり、Node依存は後続validatorの再現性の問題。今回の変更はIssue adapterとWorkerの新状態、および小さい通信補助moduleに限り、全runtimeをmainへ置換しない。古いissueAdapterSha256を更新して通すこともない。

`sync_inputs`はscripts・domain/server・packageを一括比較し、現catalog-sourceはblocked-review-required。collection実コード差もあるので無条件解除は不適切。データ更新と実行bundle／依存manifestの分離は [Issue #44](https://github.com/isinxnisi/graph-knowledge/issues/44)として独立化した。

## 確認した原因と修正

- URL2回枠切れがValueErrorで意味保留となり、その作品が再開対象から消えた。TechnicalWaitを別型とし、技術的checkpointとWorkerのretry-transport／awaiting-recoveryへ渡す。枠切れは無意味に再試行しない。
- 親累積失敗回数の指数待機を通信key別・provider別へ分離。他作品の取得・同定を同じ回で進める。完了親と子の原子的共有契約は維持し、技術的未了中の子発行は待つ。
- open/readだけを通信例外の対象にし、cache書込や応答契約違反を通信として偽装しない。HTTP／elapsed／観測phase／安全なcause型・errnoを残す。open中timeoutでDNS/TCP/TLS/応答待ちのどれかを断定しない。
- 元許可・旧resultを保全した新しい不変準備cycleに、URL限定・総残枠内・期限付き復旧許可を束縛。別IDへの再利用・総予算リセット・expired送信を拒否する。正式受入の判断には使用しない。
- 通常版「第1集」を限定対応。原語・ISBN・通常版scopeを保ち、早い刊行日のヨーヨー付き限定特装版を除く。

## 隔離試験

後述コマンドは既存のNode24／依存が利用可能な環境で実行する。provider openerは模擬、実API・DB・GitHubへの試験通信はしない。

```bash
python3 -B -m unittest discover -s tests -p 'test_collection_transport.py' -v
python3 -B -m unittest discover -s tests -p 'test_collection*.py' -q
python3 -B tests/check_issue42_transport.py --runtime /path/to/READ_ONLY_worker_runtime
```

新規回帰試験：HTTP429/503・provider別Retry-After永続化、open/read/DNS/TLS/接続errno、IncompleteRead、秘密を含む例外の非出力、認証query拒否、cache/disk/サイズ故障の分類、総量30上限、復旧の前後request／台帳／URL／期限拘束・重複適用・履歴改変・旧requestへの権限漏れ拒否。2timeout後に別作品が進み、checkpointから明示復旧して実collector→Node validator→レビュー資料まで通す。Worker再生成後も10分休憩と未完了状態を保持する。

広域Collection回帰188件が成功。その後の安全分類補強を含む最終コードで、関連83件（Issue／縮小予算／transport／Worker／時間帯・lock・休憩／下書き／sequence／既存v2）を再検証し成功。新規transport回帰10件も成功。PC停止相当のKeyboardInterruptが送信handoff後に生じてもstarted試行を2件通算し、再起動で枠を復活させないことを確認した。diff --checkも成功。

## Issue #42 保存実資料の評価（追加通信0）

実台帳SHA `199bf793f20d2384be7bb33e2ad0c943bd302604954e995290d6a787faf1ac1e`、16/30、成功body11件を複製して評価した。元permission hash `22aa37126cd4dd12393c290a8c5dccb1c3c699c82c0f4de012606486ec06ab2b`、実result・request・progress・cache計17ファイルのSHAは前後不変。

| 作品 | 保存資料だけで確認した状態 | 実運用で必要な続き |
|---|---|---|
| ピンポン | publication-753a877561d519907dd709d9の2回枠切れ、technical-incomplete | 当該URLの限定復旧許可、検索成功後のcanonical ISBN照合 |
| 鉄コン筋クリート | ndl-9784091847317の2回枠切れ、technical-incomplete | 当該URLの限定復旧許可、canonical応答の取得 |
| Sunny | 書名検索で通常版第1集・ISBN9784091885579を選択可能。canonical ISBN応答は未取得 | 元総予算残枠の範囲でcanonical応答を取得して同一性を確認。URL自体は未消費のため追加URL枠許可は不要 |

保存応答だけを使う評価では、意味保留0、技術的未了3、試行16のまま。実候補が3作品完成したとは報告しない。

Sunnyの検索body SHA `85c38b372f85ab5d93af766a1b8ed3720ac97cea012d5c8ed22442dd60e35e0c`：通常版 https://ndlsearch.ndl.go.jp/books/R100000002-I000011265531 、第1集、2011.9、版なし。ISBN9784091591029・2011.8のヨーヨー付き限定特装版は選ばない。

**一巡試験の不足応答は模擬である。** 保存検索XMLから同じNDL書誌1件を抽出した「試験専用canonical応答」と、Sunnyだけの明示TEST用許可fixtureを使った。実際に独立取得したISBN応答や実承認として保存・共有しない。その条件ではEntity2／Claim1／Source1／Citation1のhidden候補、ISBN・原語scope、レビューと未承認decision-request、実validatorの成功を確認。試験用台帳は16→17、実台帳は16のまま。未取得の証拠を捏造して実運用へ流す変更はない。

## 実環境へ反映する場合の範囲と復旧案（今回は未実施）

1. 共通lockとWorker lockを現地確認し、既存pause-newで安全な境界を確保する。強制解除・実行中killはしない。今回のコード追加だけでは実Workerは変わらない。
2. 実配備の全module SHA、config、依存、request／承認／receipt／cache／job／stateをmanifest付きで保全する。変更するのはレビュー済み collection-issues.py／collection-worker.py と新しいcollection-transport.py。workflowやcollector・制御・既存jobのhashは据置。VPS/publicationの固定WSL peer互換性も確認してから限定backportする。
3. 旧requestのadapter固定SHAは変えない。今回の旧親は完成resultを保持し、子なし・同一permission／issueOriginの新不変cycleを登録する。元16/30と成功bodyを共有し、失敗済み2URLだけ明示復旧許可へ固定する。今回はその許可の作成・実行をしていない。新sourceCommit／実配備module／catalog互換性の確認が必要であり、main最新を無条件採用しない。
4. 状態・hashを確認後、変更したpause制御だけを適切に復旧し、既存時間帯・休憩・通常スケジュールへ返す。cache読取で追加通信が必要にならないこと、既存公開51Claim／正式receipt10件を再受入しないことを確認する。
5. 失敗時は安全な境界で旧program一式へ戻し、保全manifestと照合する。**state、試行台帳、grant消費、旧／新result、receiptをロールバックしない**。新復旧依頼は停止記録を残し、旧実装で無理に処理しない。設定・鍵・公開KGを変更するrollbackは不要。


## レビュー対象の固定実装

実装commit `68437af35b6d9cf84de0eb860061f0a2f364140e`。次の一式を対象とし、実環境へ個別に未レビューのHEADを配置しない。

| module | 修正版SHA-256 |
|---|---|
| collection-issues.py | 38aadaee84b039f9f991ac1cc831a9498a4d83fab062d96b7c252d7175326dab |
| collection-worker.py | 0f6dfd1367e7f07e1bdc85d9944688c6803ce785c21261a86757f45b86484583 |
| collection-transport.py | c0fa12142779b2ba15bede136b85d4510fd37e306a100f45901f0820571e6483 |

旧配備7 moduleのSHAと互換基準は作業終盤にも再読取し、上記調査表と一致した。実Workerの設定・コード・旧Issue42成果を変更していない。Web／検索UI変更はなく、3200・beta・VPSの再build／再配置対象はない。
