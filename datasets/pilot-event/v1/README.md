# 特定Event参加パイロット v1

**2026-10-06にユーザーがE01/E03と開催回の同一性・開催期間を受入。生成・validate・専用DB投入済みの凍結v1。** [狭い受入範囲](ACCEPTANCE.md)／[実施・観察記録](../../../docs/archive/phase-15-event-participation/README.md)。

科学v2の10 Claimを対照としてコピーし、1927年第5回ソルヴェイ物理会議を特定開催回として追加した版。Lorentzの広い参加＋会議議長、Diracの広い参加の3 Claim。E02の招待／欠席はexcluded/pending。全日程・全session・シリーズ全回を示さない。

Source／locator／原表記／language／scope／禁止する推論はledgerに保持。研究台帳の原版は書き換えない。人間受入とCodexの意味設計を区別し、acceptedを推測で付けない。新Event／Lorentzには確認していないQIDを付けない。Diracは既存science内部IDを再利用する。

開催期間はEventの属性、参加Claim期間は両端null。投入件数はEntity10、Claim13、Source11、Citation15、ExternalIdentifier8。広いLorentz参加と会議議長は同じ資料の別粒度であり独立Sourceが増えた意味ではない。

確認環境を起動する。生成物とmanifestは受入済みledgerから再生成できる。

```bash
cp .env.event.example .env.event
npm run event:prepare
npm run event:validate
docker compose --env-file .env.event -f compose.event.yaml up -d --wait
npm run event:seed
npm run event:seed
npm run event:dev
```

Web http://127.0.0.1:3215、Neo4j Browser http://127.0.0.1:7479、Bolt7692。既存凍結datasetへ入れず、専用volumeとseedの混在拒否を使う。収集台帳検証のみなら`node --import tsx scripts/prepare-event.ts --review`。未受入版の生成／seedをDB接続前に拒否するゲートは維持する。今回の受入判断はledger/manifestへ記録済み。

人工の契約検証は別環境（tests/fixtures/event-contract.ts、compose.event-test.yaml、Web3216/Bolt7693）で行う。こちらの通過を実資料受入・観察済みとして扱わない。
