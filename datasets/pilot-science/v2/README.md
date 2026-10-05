# 科学・研究機関パイロット v2

2026-10-05。v1の8広いAFFILIATED_WITHに、ハイゼンベルク→NBIのVisitor 1924–1925、Associate professor 1926–1927を新しい2 Claimとして追加。元の8 Entity/QID・9 Source・9 Citationは維持し、同じ資料を根拠とするCitationが2件増える。合計8 Entity / 10 Claim / 9 Source / 11 Citation / 8 ExternalIdentifier。

[意味契約](../../../docs/design/TYPED_QUALIFICATION_CONTRACTS.md)。現在の原語を資料上の立場として扱い、雇用形態・常勤・日本の職位・連続在籍を認定しない。C09は保留で投入しない。旧NBI名称の同一性はv1の受入を継承し、現在名表示を続ける。

ledgerの今回受入、原表記/en・期間原表記・scope・禁止推論・v1Claim ID・Phase13 Source/候補への参照を確認してから生成する。manifestはledger/data、既存凍結dataset入力26 JSON、研究台帳をhashで拘束する。既存Source.noteの「今回Visitorのみ受入」はv1の収集履歴として保持し、新Citationでv2の受入範囲を説明する。

```bash
cp .env.science-v2.example .env.science-v2
npm run science:v2:prepare
npm run science:v2:validate
npm run qualification:check
docker compose --env-file .env.science-v2 -f compose.science-v2.yaml up -d --wait
npm run science:v2:seed
npm run science:v2:seed
npm run science:v2:dev
```

Webは **http://127.0.0.1:3214**。既存science v1の3213と別環境。Neo4j Browser7478 / Bolt7691 / .next-science-v2、専用Compose project/volume。GRAPH_DATASETがpilot-science-v2以外、専用port以外、別datasetの既存ノード/接続、同IDの属性相違は拒否。通常seedで上書き・削除をしない。

```bash
npm run science:v2:integration
npm run science:v2:e2e
npm run science:v2:build
```

実DB統合テストには専用DBとWebの起動が必要。PlaywrightはWebを起動する（起動済みを利用する場合はGRAPH_TEST_REUSE=1）。OSにChromiumの依存がなければPlaywrightのinstall-depsが必要。設定へ特定環境のlibrary pathは固定していない。
