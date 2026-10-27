# Worker更新・映画34 Claim正式受入後の現在地

2026-10-28。運営者の固定対象への実承認を受け、5ファイルbackport、34 Claimの正式受入、release候補・offline plan・root実plan・既存delivery登録まで完了した。**本番公開署名・apply・beta／本番Web切替は行っていない。** 次は [固定requestの個別公開署名](PUBLICATION_APPROVAL_REVIEW.md)。

## 実施した固定対象

- Worker source `089ee51922d68b03f2e8a9029a3811babfc3dc67`、overlay manifest `68b62c2f93704d8f82b93f0ac2dc6cc94e020c7802edd0a16e8ace5651f44d0e` の5ファイルだけを更新。[配置結果](worker-installation-result.json)。旧bytesはprivateな復旧directoryへ保存した。
- base pin `973c7b0c599f79905a029b28b524f4924e169376`、collector実行hash `80e05b67bc0129b963653b90df4cfbfa5bd6aff190acda99f54c08541e55801e`、既存38依頼・承認、coordinator／peer設定・既存4 backportを保持。更新中のconfig／state／全11 receiptも不変。
- 元の固定判断票SHA `153830c9413b9d1368939b67289126a5e6dde5bc275cc2bcdfa31bdb5881f51a` を保持。[実発言と時刻の出所](approval-provenance.json)はCodex turn `01a17f0c-05e5-7650-8d19-af2d43551e5c` の人間メッセージ。受領時刻2026-10-27T20:27:36Z。
- [実承認票](claim-decision-approved.json) SHA **`61dddbb75935d90768d61c403ccdb4cd6c6522b95da876b76feae9e87b2cdb71`**。[変換記録](acceptance-approval-record.json)。変更は承認status・実humanDecision・identityDecision.statement・roleMappingDecision.statementのみ。意味・根拠・UUID・選択ID・null scope／periodは同一。
- [正式receipt](formal-acceptance/acceptance.json) SHA **`7b96b1c64ed106b1a17d493ca86b5b12e1e306e2551c191e52d6df77876c5df6`**、記録2026-10-27T20:38:59.528925+00:00。全receiptは12件となり、旧11件はbyte単位で保持。新receiptの207根拠参照はdata root内の相対path。

| 対象 | 正式受入 | 本番公開 |
| --- | ---: | --- |
| A群 DIRECTING／ACTING | 15 Claim | 未公開 |
| B群 SCRIPT_WRITING／PRODUCING | 19 Claim | 未公開 |
| 新Entity UUID | 29 | 未公開 |
| 新Source／Citation | 5／34 | 未公開 |

既存正式3 Entity UUIDはそのまま。初回公開済み2 Claimは今回の受入・公開候補の追加集合に含まれない。

## 検証・公開候補

受入release `film-saved-ab-20261028` の既存CLI validateと完全本番backupに対するoffline planが成功。追加131 node／165 relationship、既存更新0。旧公開データの全4種record本文が同一であることを直接照合した。[受入・plan結果](formal-acceptance/preparation.json)。

更新後・正式受入後にも、全12 receipt＋映画入り公開base＋保存済み漫画jobで実collect-review／再実行／受入準備／validate／offline planを隔離再検証した。通信追加0、選択する漫画は1/1/1/1、既存更新0、新規正式受入0。[更新後の実経路](results/worker-workflow-after-install.json)。manifest単体8件もNode24環境で成功。システム既定Nodeが古い試行での `--import` 非対応は実行環境の誤りとして区別し、承認対象のプログラム変更で回避していない。

本番baseはrelease `publication-film-initial-20261027`、revision `7c54da24-6fa9-46a5-810d-834eed8328d9`。backup SHA `c914fb71d0dd3953ea6f5be90603f8de4da137addaa8eaf548c8d632436669ae`。受入前後の本番metadataとreceiptを再検証している。

[公開候補](publication-candidate.json)は既存固定source7392d8eのreceipt-only builder、正式10 Role対応image、全12 receiptを使用。新規自動化・gate更新は行っていない。既存自動準備が作成済みのdurable intentを同じ入力・同じnonceで継続した。Issue #53で既知の一時directory mount／JSONキー順の問題には、前回と同じ一度限りのschema直列化を再利用し、JSON値の完全一致を要求した。稼働自動化コードは変更していない。

候補nonce `13abfb93-ba2d-44f7-a56b-352aa7ab0ab0`、release `publication-8b0b1d67656a15c7e505ba1f`。この段階のplan hashはoffline planであり、個別公開署名に使うroot実planとは区別する。

後続のroot実plan SHAは `8e6dbf83d411acef77c2631c1dde6a466f2b8fb7a45e742371334560416ee5e7`。同じ131 node／165 relationship追加・更新0の投影とhash一致。全12 receiptの既存peer証明、通常Workerのpause-new ACK（revision7）、rootの公開承認待ち、delivery登録とoperator describe成功を確認した。[最終検証](results/publication-preparation-verification.json)。公開承認ファイルは未作成で、本番revisionは不変。

## 停止・再開の記録

最初の受入試行は通常Workerのlock競合でreceipt作成前に停止した。次の試行ではPython 3.10のISO parserが承認時刻のZ形式を拒否したため、同一瞬間の `+00:00` 表記へ変換した。失敗試行のhashと[未受入票](execution-history/z-timestamp-rejected/acceptance-approval-record.json)を保持。対象データ・承認の意味・時刻を変更せず、実承認票の新hashで正式受入した。schemaや公開gateを緩和していない。

## 未収録研究の引継ぎ

[最新の全件台帳](RESEARCH_COVERAGE_CURRENT.json)は124候補・97 Entityをすべて保持する。凍結した研究資料・旧coverageは上書きしていない。

- 照合済み81記録：正式受入36（既公開2＋今回未公開34）、**未受入45**（A/B29＋C/D16）。
- Entity97候補：正式UUID32（既存3＋今回29）、**残り65候補**。
- 構造化候補37・研究保留6も維持。全124候補中、未受入は88。全研究の収録完了とは扱わない。
- A/Bの残り29件は不足根拠28と人物名対応1。不足は原役割見出し・実演文脈の未転記等であり、根拠不存在へ変更しない。保存資料から不足部分だけ補い、C/Dの新Role・新構造の判断を待たず次の採用可能集合を準備できる。

main・3200・beta・本番Web・本番KG・会員DBは今回変更していない。次の確認環境はCLIの正式receipt／release候補。公開後の画面確認は個別署名・applyの後で別途行う。
