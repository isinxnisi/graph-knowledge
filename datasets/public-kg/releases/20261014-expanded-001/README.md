# 公開βの実データ拡充候補

状態: 2026-10-14、ユーザーが3200/TunnelとVPSへの反映を承認。3200へ適用済み（後続PLUTO補充も適用）。VPSも適用・HTTPS実ブラウザ4件の確認済み。[版・hashに結合した受入記録](../20261014-pluto-001/acceptance.json)。元収集台帳のpendingは承認前snapshotであり、この受入記録が後続判断を示す。

| 知識Node | 現在 | 追加 | 反映後 |
| --- | ---: | ---: | ---: |
| Entity | 18 | 2,081 | 2,099 |
| Claim | 27 | 1,795 | 1,822 |
| Source | 15 | 1,722 | 1,737 |
| Citation | 29 | 1,829 | 1,858 |

Nobel公式APIの受賞時所属829記録（追加827 Claim）＋Wikidataの東京大学への明示P108 1,000記録（追加968 Claim）。既存person/organizationとAFFILIATED_WITHを使い、期間・職位を推測しない。Nobelは公式機関の記録、Wikidataは共同編集された二次データとしてSource側で区別する。画像・伝記全文は取り込まない。

同一Wikidata ID、明示照合した大学・Lorentzの同一性を再利用する。大学の部局を大学へ自動統合しない。観察された大学英語名5組、Goettingenと既存ゲッティンゲン大学、東京大学の東京／柏は明示対応する。名前の部分一致による自動mergeはしない。旧18 Entity・27 Claim・15 Source・29 Citationは内容不変。会員PG・凍結datasetには書き込まない。

## 生成・確認

```bash
python3 scripts/prepare-nobel-affiliations.py --check
python3 scripts/prepare-wikidata-employers.py --check
npm run public:validate -- datasets/public-kg/releases/20261014-expanded-001
npm run public:plan -- datasets/public-kg/releases/20261014-expanded-001
```

baseReleaseは20261011-001。data.jsonは全期待snapshotで、既存データを保持する。manifestにはraw snapshot・版付き収集台帳のhashとClaim由来を記録する。承認前の台帳pendingを、人間受入済みへ読み替えない。

## 反映と復旧

人間確認の対象は、上記件数・意味・取得元・既存変更0件の追加全体。ローカル公開KG（3200/Tunnel）とVPS plunode.netへの反映前に確認する。VPS bundleは/home/develop/graph-expanded-20261014へ配置する。管理者実行scriptはscripts/apply-expanded-public-kg.sh。

適用直前に既存operatorでKG単独backup、dry-runの既存変更0件と件数を再照合し、既存transaction経路で適用・再適用無変更を確認する。Web・Neo4j・PGの再起動、会員PGへの書込み、credential・Caddy変更は行わない。意味変更・暗黙削除・base違い・driftは既存guardで拒否する。

復旧は、現在のKGもbackupしてから、適用直前の控えを既存restore-plan/restoreへ渡す。期待revisionを照合し、KGだけを復元する。会員保存は巻き戻さない。適用transaction失敗は自動rollback。軽微な表示上の問題だけで追加全体を自動撤回しない。

## 今回の限界・次の追加

大学を介した探索は増えるが、新規は組織関与が中心。家族・作品派生・影響を推測して足さない。Wikidataの現snapshotは東京大学の限定した1,000 statementであり、クエリに列挙した7大学全体や全教職員を網羅しない。新規名称は英語または日本語の取得labelで、全Entityの日本語・英語aliasを網羅しない。原資料の期間・職位の全限定は構造化しておらず原項目で確認する。

次はWikidata P108を大学ごとの取得へ分け、他大学との明示的な接続を増やす。次いでP737の人物間影響を既存INFLUENCED_BY契約に合うperson→personだけで追加し、組織関与以外の枝を増やす。いずれも現時点では未収集・未投入。
