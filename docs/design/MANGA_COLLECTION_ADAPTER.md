# 漫画収集adapterと初回実行条件のレビュー

2026-10-16。企画範囲は **44中心作家＋9共同制作者・102作品**で合意済み。**本番用テーマの実行承認・個別知識の受入・公開は未実施**。この資料は実装と隔離試験を説明する。

## 次にレビューするもの

登録済み定義は [famous-manga-creators/r0002](../../datasets/collection-themes/themes/famous-manga-creators/r0002.json)。[旧草稿のレビュー用控え](../research/famous-manga-creators/20261016/r0002.draft.json)も同じ内容に更新した。r0001は保持する。

定義SHA-256：`c61614326ace666c9c4d498b6349d3d1d524e0b83017695fd960a3e34879b863`。

企画上の102作品全件を一度に実行する承認ではない。今回の実行条件は次に限定する。

- [レシピ](../../datasets/manga-collection/v1/recipe.json)内の8作品・12人物アンカー。作品QIDと漫画の種別、人物QIDと本人の名・別名、作品ごとの第1巻ISBN・NDL主書名・巻・言語を照合する。同名だけで結合しない。
- Wikidataの固定QIDをSpecial:EntityDataで取得。NDLはSRUの `iss-ndl-opac` をISBN指定で最大5件。出版社HTML・参照先への連鎖取得・画像・本文は対象外。
- 逐次、最小1秒間隔、timeout20秒、1応答4MiB以下。試行は失敗・再開を通算して64回以下、同一要求2回以下。429／503のRetry-Afterを保持する。
- 新規Entity40・Claim32以下、凍結baseを含む全体Entity2,200・Claim1,900以下。これは出力上限であり、達成すべきノルマではない。
- 著／著者＝AUTHORSHIP、作＝CREATION、画／作画＝DRAWINGのみ、単独の明示責任表示から候補化。原作・原著・漫画・監修・集約著者表記はこのadapterでは保留。Wikidata P50／P110だけで担当を確定しない。
- base `20261014-credits-001` の全既存レコードを無変更で保持。新規Claimはhidden。候補受入・公開・会員PG操作は行わない。

## 再利用した仕組みと処理

[既存テーマCLI](COLLECTION_THEMES.md)へ `manga-discovery-v1` を追加した。コードhashはadapterとgate本体を含み、レシピ・候補一覧・base data／manifestのhashも承認に固定する。変更があれば新revisionのレビューが必要。

`work-order.json` が承認版を固定し、`ledger.json` にテーマID・revision・定義／承認hash、取得元・取得日時・応答hash、Wikidata statement ID／qualifier／reference、NDLの責任表示、同一性対応、保留理由を残す。参照先の内容まで検証したという意味ではない。既存のSource／Citationと取込由来を区別する。

候補のIDはQID／関係の意味／Role／刊行物scope／資料から安定生成する。既存UUID・同じRoleとscopeのClaim・同じURLのSourceを再利用し、同Claim／SourceへのCitationを重複追加しない。別scopeや広いClaimを勝手に統合・変更しない。

通信が失敗するとjobを失敗として記録し、未収録・根拠なしとして処理しない。同じ `run` で、hashを確認した取得済みレスポンスから再開する。取得履歴と試行数はjobの `request-cache/requests.json` に保持する。retry上限に達した場合やsnapshotが改変された場合は停止し、運営者が内容を確認する。完了済みrunは成果物のhashを検査して無変更で返す。

### 未受入と公開検証の境界

既存 `public:validate` は公開予定fixtureを検証し、hidden Claimを撤回記録なしでは拒否する。**未受入を撤回に偽装せず、既存契約を維持する。**

候補本体は `artifacts/candidate/{data,manifest}.json` に新規Claim hiddenで保持する。公開形式へのprojectionは `validation-only/` に一時生成し、既存 `public:validate` に通した後で削除する。この一時変換は技術検証であり、人間受入ではない。残るhidden候補を `public:plan/apply` にそのまま渡すと既存validatorが拒否する。

受入後の公開では、レビューした候補だけから最新KGに対するreleaseを作り、既存の `public:validate` → `public:plan` → バックアップと公開確認 → `public:apply` を利用する。今回、その段階には進めていない。

## 実データによる隔離試験

試験専用registryの `isolated-manga-adapter-trial` にだけTEST-SIMULATION承認を作成した。本番用 `famous-manga-creators` の承認へ転用していない。

取得は28要求：Wikidata人物12件・漫画作品8件、NDL第1巻書誌8件。全8作品を同定できた。既存人物4＋PLUTOの計5 Entityを再利用し、新規Entity候補15（人物8・作品7）を生成した。

| 作品 | NDL書誌で取得した責任表示 | 初回の結果 |
| --- | --- | --- |
| PLUTO | 手塚眞 監修／浦沢直樹 [ほか]著 | 両方保留。集約表記から他の著者を推定しない。既存PLUTO・受入済みRoleは保持 |
| トリリオンゲーム | 稲垣理一郎 原作／池上遼一 作画 | 池上のDRAWING候補1。原作は保留 |
| Dr.STONE | 稲垣理一郎 原作／Boichi 作画 | BoichiのDRAWING候補1。原作は保留 |
| アイシールド21 | 稲垣理一郎 原作／村田雄介 漫画 | 両方保留。「漫画」を別資料の「作画」に無断で置換しない |
| DEATH NOTE | 大場つぐみ 原作／小畑健 漫画 | 両方保留。出版社紙版の「著者」を使うなら個別の追加根拠確認へ |
| ヒカルの碁 | ほったゆみ 原作／小畑健 漫画／梅澤由香里 監修 | 全て保留。梅澤は対象一覧外でもあり、自動追加しない |
| チェンソーマン | 藤本タツキ 著 | AUTHORSHIP候補1 |
| SPY×FAMILY | 遠藤達哉 著 | AUTHORSHIP候補1 |

根拠を確認できた新規関係は次の4件。**全件、人間未受入・未公開**。

- 池上遼一 → トリリオンゲーム、作画：[NDL書誌](https://ndlsearch.ndl.go.jp/books/R100000002-I031350948)、ISBN 9784098610105。
- Boichi → Dr.STONE、作画：[NDL書誌](https://ndlsearch.ndl.go.jp/books/R100000002-I028309496)、ISBN 9784088811840。
- 藤本タツキ → チェンソーマン、著：[NDL書誌](https://ndlsearch.ndl.go.jp/books/R100000002-I029534501)、ISBN 9784088817804。
- 遠藤達哉 → SPY×FAMILY、著：[NDL書誌](https://ndlsearch.ndl.go.jp/books/R100000002-I029763265)、ISBN 9784088820118。

NDL責任表示15件のうち4件を候補化し、**11件を保留**（原作5・漫画3・監修2・集約著者1）。Wikidata P50／P110の16 statement（人物作品組では14）は別に保存し、Role付きClaimや独立根拠の追加数には数えていない。新規Source4・Citation4。既存Claimの再利用はこの実試験では0件で、同一Role／ISBNの再利用・重複防止はテストで確認した。

証跡：[summary](../../datasets/manga-collection/v1/trial-20261016/summary.json)、[台帳](../../datasets/manga-collection/v1/trial-20261016/ledger.json)、[取得snapshot・hashと試験履歴](../../datasets/manga-collection/v1/trial-20261016/evidence.json)。NDLはNDL作成書誌の選択フィールドだけを凍結し、応答に含まれる第三者所蔵情報は含めていない。full responseはGit外の試験キャッシュだけに置く。

最初の試験でJSON正規化とhidden候補／公開release契約の差を検出して修正した。r0002／r0003の再検証ではhash確認済みの28応答を再利用し、追加のAPI取得はしていない。失敗した試行とその理由も `.local/collection-trials/manga-20261016/` に保持した。最終r0003は成功、同じrunの再実行は `unchanged: true`。

Python23テストと既存公開／Nobel／制作Roleの21テストが成功した。未承認実行、改変、通信失敗からの再開、通信上限、同名・別メディア、未対応責任表示、既存データ無変更、hidden候補の公開経路拒否を検証対象とする。

## 情報源の条件

[Wikidata公式Data access](https://www.wikidata.org/wiki/Help:Data_access)のCC0構造化情報のみ。[NDL API提供元一覧](https://ndlsearch.ndl.go.jp/help/api/provider)と[API利用説明](https://ndlsearch.ndl.go.jp/help/api)に基づき、対象は許諾条件が明確なNDL作成書誌に限定する。広告収益のあるサービスも営利利用として区別される。Source／snapshotに国立国会図書館・CC BY4.0・提供元条件URLを保持する。NDLサーチの全提供元・書影・本文へ同じ条件を広げない。

継続利用の連絡協力依頼は定期運用前の確認事項。今回、申請・メール・外部フォーム送信・定期取得設定は実施していない。出版社資料は人間の個別確認先であり、このadapterでクロールしない。

## 操作と次の単位

管理用CLIはmainの作業環境で利用する。Web／VPSの再build・DB変更は不要。変更・承認記録の保存時は通常のautopilot holdとGit手順に従う。

```bash
python3 scripts/collection-themes.py review famous-manga-creators --revision 2
```

人が上記定義とhashを確認して承認した後だけ、次を実行する（**今回は未実行**）。

```bash
python3 scripts/collection-themes.py approve famous-manga-creators --revision 2 \
  --sha256 c61614326ace666c9c4d498b6349d3d1d524e0b83017695fd960a3e34879b863 \
  --reviewer REVIEWER --note '8作品の取得範囲・資料条件・上限を確認。受入と公開は別判断' --confirm-review
# Node24がPATHにある環境で実行する。
python3 scripts/collection-themes.py run famous-manga-creators --revision 2
python3 scripts/collection-themes.py jobs
python3 scripts/collection-themes.py inspect JOB_ID
```

残る94作品は同じadapterへ対象QID・代表ISBNを追加し、上限とともに次版でレビューする。筆名・漫画版・部・初出版の同定や新しい責任表示に個別対応が必要なら、その変更もレビューする。**原作の意味判断は接続の深さに影響する課題**だが、他の著者・作画候補の収集まで止める理由にはしない。

今回のWebソース・公開KGは変更していない。停止していた3200は既存build `8pogz_6LVRvtVLHKWXuc9` を再起動した。3200／TunnelのdatasetとPLUTO検索は200、revision `82b01515-594c-48ca-b4b6-515eefac83ca` を維持。本番HTTPSもdatasetとPLUTO検索200、revision `5e2a94af-9061-4087-bb7a-045a3c0133f4` を維持。Webの再build・VPS更新・KG／会員PG書込は行っていない。
