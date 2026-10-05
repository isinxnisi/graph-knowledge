# 特定Event参加パイロット v1

**E01/E03・開催回の人間受入待ち。現在はledgerのみ。実データ生成・seedはまだ許可されない。**

科学v2の10 Claimを対照としてコピーし、1927年第5回ソルヴェイ物理会議を特定開催回として追加する候補。Lorentzの広い参加＋会議議長、Diracの広い参加の3 Claim。E02の招待／欠席はexcluded/pending。全日程・全session・シリーズ全回を示さない。

Source／locator／原表記／language／scope／禁止する推論はledgerに保持。研究台帳の原版は書き換えない。人間受入とCodexの意味設計を区別し、acceptedを推測で付けない。新Event／Lorentzには確認していないQIDを付けない。Diracは既存science内部IDを再利用する。

開催期間はEventの属性、参加Claim期間は両端null。予定件数はEntity10、Claim13、Source11、Citation15、ExternalIdentifier8。広いLorentz参加と会議議長は同じ資料の別粒度であり独立Sourceが増えた意味ではない。

受入判断を記録してから以下を実行する。

```bash
cp .env.event.example .env.event
npm run event:prepare
npm run event:validate
docker compose --env-file .env.event -f compose.event.yaml up -d --wait
npm run event:seed
npm run event:seed
npm run event:dev
```

Web http://127.0.0.1:3215、Neo4j Browser http://127.0.0.1:7479、Bolt7692。既存凍結datasetへ入れず、専用volumeとseedの混在拒否を使う。収集台帳検証のみなら`node --import tsx scripts/prepare-event.ts --review`。pendingの生成／seed失敗は意図した受入ゲートでありDB障害ではない。

人工の契約検証は別環境（tests/fixtures/event-contract.ts、compose.event-test.yaml、Web3216/Bolt7693）で行う。こちらの通過を実資料受入・観察済みとして扱わない。
