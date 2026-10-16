# 漫画r0002の正式受入と公開release候補

2026-10-17。人間の今回の明示判断に基づく後続記録。過去のCodexレビューを人間承認へ読み替えない。[旧受入レビュー](MANGA_R0002_ACCEPTANCE_REVIEW.md)とそのreview/proposed-records/verificationはhashを保全し、本書で現行状態を更新する。

## 正式受入した対象

判断者は**プロジェクト運営者**。実際の記録日時は2026-10-17 01:21:29 JST（2026-10-16T16:21:29+00:00）。[acceptance.json](../../datasets/manga-collection/accepted-r0002-20261017/acceptance.json)が対象UUID・ExternalIdentifier・根拠artifactのSHA-256・人間の判断内容・各環境のapply不許可を保持する。

| 人物→作品 | Role | 日本語第1巻ISBN | Claim UUID |
| --- | --- | --- | --- |
| 池上遼一→トリリオンゲーム | DRAWING | 9784098610105 | cf18d898-41e5-486f-8dcf-8a666bef83fe |
| Boichi→Dr.STONE | DRAWING | 9784088811840 | fe6d7c19-646b-474a-ad0a-3b20bc816866 |
| 藤本タツキ→チェンソーマン | AUTHORSHIP | 9784088817804 | 84cb19dd-9e8e-496f-abf6-674885abf185 |
| 遠藤達哉→SPY×FAMILY | AUTHORSHIP | 9784088820118 | 07da4e98-1047-46a4-b48a-30f3549c89f9 |

新規7 EntityはBoichi・藤本タツキ・遠藤達哉と上記4作品。池上遼一は既存Entityを再利用する。4 Source・4 Citationはレビュー済みのNDL書誌・原責任表示・locator・UUIDを維持する。ISBNは作品Entityの同一性をISBNへ縮約するためでなく、Claimの適用刊行物を示す。

残り8 Entity（稲垣理一郎・村田雄介・小畑健・大場つぐみ・ほったゆみ・アイシールド21・DEATH NOTE・ヒカルの碁）は同一性の受入推奨を維持し、今回の正式受入・先行公開から除外した。

## release候補と無書込検証

候補は `20261017-manga-r0002-001`、baseは `20261014-credits-001`。[artifactと再現手順](../../datasets/public-kg/releases/20261017-manga-r0002-001/README.md)。既存の公開release方式を使い、受入記録と旧公開artifactのhashを検証する小さい生成処理 `scripts/prepare-manga-release.py` を追加した。全既存レコード・UUID・接続・公開状態・由来・撤回履歴を保持し、正式受入した4 hidden候補だけをrelease内でpublishedへ変換する。DBへは接続しない。

| 差分 | 追加数 | 候補の合計 |
| --- | --- | --- |
| Entity | 7 | 2,116 |
| Claim | 4 | 1,848 |
| Source | 4 | 1,755 |
| Citation | 4 | 1,884 |
| ExternalIdentifier | 7 | 2,485 |

ローカルの現行KGを既存backup経路で読み取り、base fixtureと完全一致、撤回0件を確認した。releaseは `20261014-credits-001`、revisionは `82b01515-594c-48ca-b4b6-515eefac83ca`。private backupは `backups/manga-r0002-before-preparation-20261017.json`、checksumは `c0325a131a6e4efc3474d30701d3e3622ebf27593d4087b10af1e2d150b97172`。会員PGは触れていない。

`public:validate` とローカル `public:plan` は成功。追加26知識Node／23 Relationship、既存更新0。未受入8 Entity・原作5 Claimの混入なし、同一性衝突・二重取込なし。applyはローカル・beta・VPSとも未実行。VPSの既存SSH接続先はport22 timeoutで接続できず、現地planは未実施。接続設定の変更や書込による回避はしない。

## 原作5件とその他の保留

[原作候補台帳](../../datasets/manga-collection/original-story-r0002-20261017/README.md)に5 Claimをhidden・pendingとして保存した。新Roleの採用後に凍結NDL書誌のISBN・日本語第1巻・漫画・責任表示・人物／作品UUIDを再照合し、同じRole・scope・SPOの既存Claimがないことを確認した。独立資料の追加を意味しない。個別の人間判断はまだない。

| 次の候補 | 現状と必要な判断 |
| --- | --- |
| 稲垣理一郎→トリリオンゲーム／Dr.STONE／アイシールド21 | ORIGINAL_STORY、各日本語第1巻のNDL書誌。個別Claimと稲垣・アイシールド21 Entityの受入待ち |
| 大場つぐみ→DEATH NOTE | ORIGINAL_STORY、9784088736211。人物・作品・Claimの受入待ち |
| ほったゆみ→ヒカルの碁 | ORIGINAL_STORY、9784088727172。人物・作品・Claimの受入待ち |
| 村田雄介→アイシールド21「漫画」 | 原語保持。小学館漫画賞資料の「作画」から作品scope未構造化のDRAWING候補を別途審査できる。NDLのISBNを別資料へ移植しない |
| 小畑健→ヒカルの碁「漫画」 | 原語保持。日本棋院の「作画」等の別根拠を使用するDRAWING候補を別途審査できる。publication scopeは自動補完しない |
| 小畑健→DEATH NOTE「漫画」 | 出版社の「著者」はAUTHORSHIPの別候補になり得る。DRAWINGは明示的な追加資料待ち |
| 梅澤由香里→ヒカルの碁「監修」 | SUPERVISIONを再利用可能。未収録人物の同定・表記（吉原／梅沢／梅澤）・NDL刊行物scopeを個別確認してから候補化 |

PLUTOの手塚眞SUPERVISION `cc2bc0c3-d8e7-47fe-8aaf-1b219bff0137` と浦沢本人AUTHORSHIP `839b0bb8-1781-4a3e-8446-9a22d08d1658` は公開済みClaimを再利用し、追加生成しない。「[ほか]著」の省略人物や担当を展開しない。別資料のURL・原語は[既存制作Roleレビュー](MANGA_PRODUCTION_ROLE_REVIEW.md)に保持する。

## 次の収集と公開前の確認

原作の新Role対応はadapterの次版へ持ち越す。残り94作品は既存catalog anchor、Wikidata exact QID、NDL ISBN検索・凍結応答・予算・再開可能cache、hidden候補、重複比較、個別レビュー、公開releaseの流れを再利用する。新しい管理基盤は作らない。

次版はまとまった作品群を明示した別runVersionとして、入力作品・人物・ISBN・役割対応・request予算・code/input hashを固定してレビューする。8作品のr0002を上書きしない。人物数と責任表示数でAPI予算を見積もり、同定不能／未対応表記は保留へ返す。テーマ実行承認と個別Entity/Claim受入を分離したまま継続収集する。残り94作品の実行承認は今回に含めない。

公開applyの前に、人間の別途apply指示、各環境の最新baseRelease・revision・無書込plan、最新backup、配置済みWeb／operatorの対応、KG以外のDBへ接続しないことを再確認する。baseやrevisionが変わった場合は現在の状態を取り直し、候補を再生成／再検証する。今回の候補を古いplanのまま適用しない。原作5件の受入は別判断であり、本releaseへ後から混ぜない。

検証・環境反映の最終結果は同directoryの[verification.json](../../datasets/manga-collection/accepted-r0002-20261017/verification.json)に記録する。

## 検証と確認環境への反映結果

通常43 file・644/644テスト、語彙8 Role／0 error（固定Git baseとの照合を含む）、限定契約、typecheck、lint、public build、隔離Neo4j統合1件が成功。新Roleの非同一視・比較キー・保存URL／開閉復帰・日英詳細・条件editorは新規9単体テストで確認した。既存会員画面テスト2件の古い期待を現行section／linkへ合わせ、製品の会員機能を変えず全通常テストを再実行した。

対応Webのbuild `RxGZcn_57S32qXBl2Qnma` をローカル3200と `https://graph-beta.isinxnisi.com/` へ反映。各実ブラウザ1件とHTML build IDを確認し、原作条件の表示・取消・既存Graph保持を確認した。betaでは正式受入4 Claimが全て未公開404のまま。両入口のKG revisionは `82b01515-594c-48ca-b4b6-515eefac83ca` を維持した。既存Webのruntime設定と会員接続設定を引き継ぎ、DBへは書き込んでいない。

VPSのHTTPSは既存revision `5e2a94af-9061-4087-bb7a-045a3c0133f4` を返す。SSH接続不可のため無書込planと新Web／operatorの配置は未実施。ローカルの成功をVPSの成功へ読み替えない。新Role付きClaimを将来公開する前に対応版の配置を確認する。
