# Discovery Model：現行コード・公開release・シナリオの照合

2026-10-16 JSTに調査・実データ確認、2026-10-17に文書整合を確認。対応する設計は[Discovery Modelと検索体験の再設計](../../../design/DISCOVERY_MODEL_REDESIGN.md)。

## 範囲と基準

- 調査開始時main：`c98e74d240c17d179d8dbd549a1af73bdbf76155`。
- ロック取得時main：`fb58d8a9434daa81d47bc10f26ede2b2bf6652c3`。並行作業の漫画r0002承認・候補生成記録を確認。検索コード・公開releaseに変更なし。未受入候補を今回の公開探索の証拠には使わない。
- 読み取り元：[20261014-credits-001/data.json](../../../../datasets/public-kg/releases/20261014-credits-001/data.json)。
- SHA-256：`ea91b16f52a211b5a8464382ad498b7b2bb2be69a6f33fe125a73a3c7b9da2b5`。照合後も一致。
- 2,109 Entity／1,844 Claim／1,751 Source／1,880 Citation。workは漫画10件。ClaimはAFFILIATED_WITH 1,807、CONTRIBUTED_TO 33、PARTICIPATED_IN 3、INFLUENCED_BY 1。全Claimがaffirmed。
- これは固定release内の観察であり、11世界の網羅的分類監査・原資料の新しい事実受入ではない。実環境のrevisionは下表の別観測で、ファイルのhashと同じ識別子ではない。

## 実装照合で分かったこと

[検索条件とクエリ](../../../../lib/server/discovery-search.ts)、[入力と近傍条件](../../../../lib/server/http.ts)、[Graphクエリ](../../../../lib/server/queries.ts)、[条件の意味](../../../../lib/domain/exploration.ts)、[制作Role](../../../../lib/domain/contribution.ts)、[検索UI](../../../../components/DiscoverySearch.tsx)、[引継ぎ](../../../../components/Explorer.tsx)を読んだ。

1. Discoveryのテーマ集合は固定起点から2段。名前の全文検索でもEntityの漫画分類でもない。
2. around集合は中心と直接の隣接。predicate条件は「候補がそのpredicateの公開Claimを持つか」で、aroundとの直接Claimに限定していない。PLUTO周辺＋影響で浦沢が返る反例をAPIでも確認した。
3. 役割はGraphのneighborsでは条件になるがDiscovery一覧では入力拒否。方向・期間も未対応。
4. 名前欄はname/aliasesだけ。Nobelの出典・説明に受賞情報があっても「ノーベル」のqで分類検索はできない。
5. 表示済みテーマは3つ、公開起点の存在で出し分ける。この仕組みを11世界へ拡大するだけでは未収録世界が消える。
6. `DiscoverySearchResponse`は現状、初頁のdataset/revision・一致理由・能力不足を返さない。cursor内のrevision拘束と区別した。
7. 検索→Graphのpredicate明示時はRole等をnullにする。未指定のundefinedと、無条件nullの意味が異なる。再設計では引継ぐ次元を明示する。
8. 既存 `tests/discovery-search.test.ts` は入力・範囲・cursor・引継ぎをカバーするが、今回の新モデルは未実装なので、そのテスト成功を新モデルの検証として数えない。

## 証人Claimと経路

下記10件はPython標準ライブラリによる読み取り専用照合で、公開状態、両端Entity、Citationの存在、Source参照を確認した。各1 Citation。原資料を今回新たに収集・再審査したものではない。

| 対象・意味 | Claim UUID | 設計への含意 |
| --- | --- | --- |
| 浦沢→PLUTO／AUTHORSHIP | `839b0bb8-1781-4a3e-8446-9a22d08d1658` | 作者を広いCONTRIBUTED_TO全件と同一視しない |
| 長崎→PLUTO／PRODUCING | `dbc08a85-9165-4cc8-a3af-d133c83d8f67` | 同じ作品に異なる担当 |
| 手塚眞→PLUTO／SUPERVISION | `cc2bc0c3-d8e7-47fe-8aaf-1b219bff0137` | 監修を著者へ変換しない |
| 長崎→BILLY BAT／STORY_CO_CREATION | `29f3bd67-b461-49a8-bdfa-d98b1d7dcfe1` | PLUTOとのRole比較。異なる刊行物scopeを保持 |
| 浦沢→手塚治虫／INFLUENCED_BY | `b6ce3407-e3bb-44c9-867b-7b7434861af5` | このreleaseの影響は1件。続きがあると仮定しない |
| パウリ→Princeton／AFFILIATED_WITH | `554bbc81-73df-498e-b867-c90219496e2f` | Citationに1945 Physics、Claim期間は不明 |
| Nash→Princeton／AFFILIATED_WITH | `11bbe5b7-0a51-4cab-b26a-771fd0b61d85` | Citationに1994 Economic Sciences。上のClaimと同時在籍・共同研究を作らない |
| Heisenberg→NBI／VISITOR | `e71f548b-65c2-4032-a40f-342ab75b5d3e` | 1924–25、年精度、固有の組織立場 |
| Heisenberg→NBI／ASSOCIATE_PROFESSOR | `ffbe8c65-5435-4373-85c7-c091892e51d9` | 1926–27、上のClaimと別の独立限定 |
| Dirac→1927年Solvay／参加 | `d01a21f2-a6b8-4eb1-9276-8850081fcf69` | Claim期間は両端不明。開催期間をコピーしない |

追加で、長崎のPLUTO／BILLY BATはsubjectIdが同じ、パウリ／NashのPrincetonはobjectIdが同じであることをassertした。作品・機関を介する経路が存在することだけを示す。

浦沢の制作相手は重複を除き8作品、長崎は4作品。Claim数と作品数を区別した。影響は1 Claim、全workは10件、全Claimはaffirmedであることもassertした。したがって**否定・肯否混在の新設計をこの実データだけで実証したとはしない**。試作では明示した人工例を別に用意する必要がある。

再照合方法：固定JSONを読み、上表のUUIDでClaimを参照し、`visibility == published`、両端UUIDの存在、`citations.claimId`→`sources.id`を検査する。計数はDISTINCT subject/objectの組やobjectIdで行い、Citation数を接続件数へ読み替えない。2段集合は[現行seed](../../../../lib/domain/discovery.ts)から、公開Claimの両方向を2回辿る。固定releaseの集合サイズはmanga16／science38／events8だった。

## 読み取りAPIでの確認

ロック保持中、2026-10-16 23時台JSTに実施。GETのみ。localhostはWSLのPython、外部はPythonおよびWindowsのcurlで確認した。公開API以外のDB操作・ジョブ実行・設定変更はしていない。

| localhost:3200の要求 | 結果 | 判断 |
| --- | --- | --- |
| `/api/discovery/entities?theme=manga` | 200、total16 | 編集的な2段集合。漫画全体の件数ではない |
| `?theme=science` | 200、total38 | 科学全体・全ノーベル受賞者ではない |
| `?theme=manga&predicates=CONTRIBUTED_TO` | 200、total15、制作facet32 Claim | Entity数とClaim数を区別 |
| `?q=ノーベル` | 200、total0 | 文字列一致なし。ノーベル由来データの未収録を意味しない |
| `?q=Pauli` | 200、total2 | パウリとLinus Pauling。部分一致は同一人物確定ではない |
| `?around=2b7c6289-d050-4dc0-93e3-9307681253cc&predicates=INFLUENCED_BY` | 200、total1、浦沢直樹 | PLUTOへの影響Claimという意味ではない。証人条件の分離が必要 |
| `?contributionRoles=AUTHORSHIP` | 400 INVALID_ARGUMENT | 一覧のRole検索は未対応 |
| `?direction=subject` | 400 INVALID_ARGUMENT | 方向指定も未対応 |

シナリオ表のM1〜M4・S1〜S4・T1〜T3は、上記コード・固定release・現行APIの結果に対する設計ウォークスルー。新resolverの実行テストや、11世界の実UI操作試験ではない。未対応の映画・ゲーム・音楽を推測で「収録0件」と判定しなかった。

## 環境の反映状態

| 確認先 | dataset / revisionと代表経路 | 今回の扱い |
| --- | --- | --- |
| 3200 | public-kg / `82b01515-594c-48ca-b4b6-515eefac83ca`、Discovery検索200 | 再build・再起動なし |
| [日常ベータ](https://graph-beta.isinxnisi.com/) | 同じrevision、漫画＋制作total15を確認 | 初回WSL Pythonから403。Windows curl（Mozilla/5.0）で200とJSON内容を再確認できた。403の原因は特定していない |
| [正式サイト](https://plunode.net/) | public-kg / `5e2a94af-9061-4087-bb7a-045a3c0133f4`、既存 `/api/entities?q=PLUTO` 成功 | `/api/discovery/entities?theme=manga&predicates=CONTRIBUTED_TO` は404。Discovery APIの反映を確認できない。配置変更は今回の対象外 |

runtimeに影響しない文書変更のため、両環境への新しい配置物はない。稼働コードの正確なcommitはこれらのAPI応答からは判定できず、mainと同じと断定しない。正式サイトの404は、今回の設計書の配置失敗ではなく、確認時点の既存経路の状態として残す。

## 協調・検証範囲

開始時は共通ロック使用中だったため、資料・コード・固定ファイルの読み取りに限定した。別作業の完了後にholdを取得し、token付きreviewで未反映commit0、Git操作途中なし、未追跡memo.txtのみを確認してから変更・検証へ進んだ。

`make autopilot-status` は既存のWindows状態取得で「null値の式ではメソッドを呼び出せません」と失敗した。ロック解放後のtoken付きreviewとassert-heldは成功。今回、runner・予定・ロック設定の修正や、他作業の履歴の確認済み移動はしていない。

実施した検証：現行仕様とコードの照合、上表の10証人Claimと経路・件数のassert、HTTP入力と代表経路の確認、変更する6文書の相対リンク294件（不在0）、コードfence・git diff --check・変更範囲の確認。runtime・収集CLI・datasetsに差分がないことも確認した。アプリコードを変えていないためbuild・全テスト・E2Eは実行しない。UIの楽しさ・応答時間・スクロール安定性は次の操作試作で検証する未確認事項として残す。
