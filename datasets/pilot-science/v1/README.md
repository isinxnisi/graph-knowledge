# 科学・研究機関パイロット v1（凍結版）

2026-10-05、人間受入済みC01–C08だけを収録。人物5・機関3、AFFILIATED_WITH 8 Claim、Source 9、Citation 9、外部識別子8。C09（ハイゼンベルク→ボーアの影響）はpendingであり、data.json・DBに含めない。

- ledger.json：8 Entityの言語付き名称・QID同一性の判断、受入済み8件とpending C09、原職位・期間原表記・限定・受入理由、資料取得URL／時刻／hash。
- raw/Q*.json：CC0のWikidata個別取得8件。名称・同一性補助のみ。Relationの根拠ではない。
- data.json：現行fixture schema v1への決定的な投影。学術的職位を制作用Roleへ入れない。
- manifest.json：版・変換版、台帳／raw／生成データhash、受入／pending範囲。

大学・アーカイブのWeb全文は再配布しない。台帳の資料hashは取得本文の指紋であり、オフラインでそのWeb全文を再検証できるという意味ではない。短い原職位・期間表記、手動要約、参照箇所を保持する。取得UTC時刻は2026-10-04、レビュー／受入は日本時間2026-10-05。Web公開日とは別。

C01/C02/C04のperiodは両端null。C03は冬学期の年精度1921–1922、C05は1924–1925、C06は1922–1923、C07は1926–1927、C08は1932–1969。原職位・冬学期・不一致の理由をCitation.noteへ残す。Claim自体は職位、雇用、同時在籍、面識、共同研究を保証しない。

研究所の旧称と現在名は、公式沿革の改称説明と今回のユーザー受入に基づく同一Entity。親大学や都市へ関係を転写しない。現行UIは現在名で表示し、descriptionとaliasesに旧称・改称情報を残す。期間別名称モデルは未実装。

## 起動・確認

Node 24.21.0、プロジェクトルートから：

```bash
cp .env.science.example .env.science
npm run science:validate
docker compose --env-file .env.science -f compose.science.yaml up -d --wait --wait-timeout 180
npm run science:seed
npm run science:dev
```

既に.env.scienceがある場合は上書きせず確認する。画面 http://127.0.0.1:3213 、Neo4j Browser 7477 / Bolt 7690、専用volumeと.next-science。demo／漫画v1／v2は変更しない。シェルにexport済みの環境値は.env.scienceより優先される。dataset／接続先不一致は拒否する。

「ゲッティンゲン大学」→「パウリ」→「ニールス・ボーア研究所」→「ディラック」→「ケンブリッジ大学」。Graphの線からCitationの具体性・期間の意味を確認する。Source公開日と関与期間、共有機関と人物間の直接関係を区別する。

```bash
npm run science:prepare
npm run science:validate
npm run science:integration # 3213の専用Webを起動した状態
GRAPH_TEST_REUSE=1 npm run science:e2e # 起動済みWebを利用。省略時はテストが起動
npm run science:build
```

生成・検証・seedはネットワークの再取得を行わない。再seedは一致する既存データのみ受け入れ、対象外Node／Relationship・内容差を拒否する。C09等の追加受入はこの凍結版を書き換えず新dataset版とする。大量import／更新基盤ではない。

[設計と資料一覧](../../../docs/design/CROSS_DOMAIN_REAL_DATA_PILOT.md)／[実施記録](../../../docs/archive/phase-10-science-pilot/IMPLEMENTATION_SCIENCE_PILOT.md)。
