# 漫画収集 r0002：正式実行の結果と人間レビュー

2026-10-16。**収集候補生成は完了。個別Entity・Claimは未受入、未公開。** 既存CLIと固定adapterを利用し、コード・テーマ定義・レシピ・公開release・本番DBは変更していない。

## 承認と実行の証跡

- テーマ：`famous-manga-creators` r0002。8作品・12人物照合のみ。
- 承認者：プロジェクト運営者。今回のチャットで明示された収集実行承認を、既存CLIの `approve --confirm-review` で記録した。
- [正式承認記録](../../../../datasets/collection-themes/approvals/famous-manga-creators/r0002.json)：2026-10-16 23:42:40 JST。
- 定義hash：`c61614326ace666c9c4d498b6349d3d1d524e0b83017695fd960a3e34879b863`。
- コードhash：`b99443d49c7403f2ec0e014f21dcc271524c38a0ca9b062954815bfd8832a8f9`。コードと4入力のhashは実行前後に一致。
- 承認hash：`8f01b4a77dd803e31d4509a1875b71d19cea3f11b5d1aba08e29fa837c3084b9`。
- ジョブ：`famous-manga-creators-r0002-97c171eb654963e4`。
- 実行：2026-10-16 23:43:10〜23:43:56 JST、試行1回で `candidate-ready`。
- 通信：Wikidata 20件＋NDL 8件＝28試行、全件成功、再試行0。承認上限64以内。

成果物・原応答・試行履歴は、契約どおりGit外の `.local/collection-jobs/famous-manga-creators-r0002-97c171eb654963e4/` に保持する。隔離試験の結果とは別ジョブであり、今回あらためて取得した。

```bash
python3 scripts/collection-themes.py inspect famous-manga-creators-r0002-97c171eb654963e4
```

| ファイル（ジョブ内） | SHA-256 |
| --- | --- |
| `artifacts/candidate/data.json` | `dcb8abc4b1e5257eb1e4c130d51c07dc60eb8d863b2e77358f36cbd1a0293df2` |
| `artifacts/candidate/manifest.json` | `8df466b31ab76767ad3abf6a145b170d5bfbd3147654843998a2288be4d0da44` |
| `artifacts/ledger.json` | `cca48350e2193113de5e444886230ac5b5b97a93f0b22013bfd55d17da8d9f2a` |
| `artifacts/summary.json` | `96040636e53aebbeb1d1faa6f4bda196b621f39fbe46886a4ccd8a14e3638a39` |

`work-order.json` は承認定義の控え、`job.json` は試行履歴・全成果物hash、`artifacts/ledger.json` は同定・根拠・保留、`artifacts/snapshots/` は選択フィールド、`request-cache/` は取得原応答と通信記録。原応答に含まれる第三者所蔵情報はGitへ追加しない。

## 候補と重複

| 区分 | 結果 |
| --- | --- |
| 同定 | 12人物・8作品 |
| 新規Entity候補 | 15件（人物8・漫画作品7） |
| 既存Entityの再利用 | 5件（人物4・作品1） |
| 新規Claim候補 | 4件、全て `hidden`・人間未受入 |
| 新規Source／Citation | 各4件 |
| 既存Claimの再利用 | 0件 |
| NDL責任表示 | 15件中4件候補化、11件保留 |
| WikidataのP50／P110 | 16 statementを由来として保存。Role確定や追加の独立根拠として数えない |
| 収集ジョブ／通信の失敗 | 0件／0件 |

再利用したのは浦沢直樹・長崎尚志・手塚治虫・池上遼一・PLUTO。既存UUIDと既存内容を保持した。新規人物は稲垣理一郎・Boichi・村田雄介・小畑健・大場つぐみ・ほったゆみ・藤本タツキ・遠藤達哉。新規作品はトリリオンゲーム・Dr.STONE・アイシールド21・DEATH NOTE・ヒカルの碁・チェンソーマン・SPY×FAMILY。同定できたEntityにも、今回受入可能な関係候補があるとは限らない。

重複照合の基準は凍結base `20261014-credits-001`。Entity／Claim／Source／Citationの同一ID重複なし、baseの全既存レコード（2,109／1,844／1,751／1,880件）が候補内で無変更。最新公開KGへの適用時には、別途その時点のKGと照合する。

## 次に受入判断できる4関係

すべて `CONTRIBUTED_TO`、肯定、期間不明。**指定ISBNの日本語第1巻という刊行物scopeに限定**し、シリーズ全巻・全版へ一般化しない。NDL作成書誌の責任表示を支持根拠とし、WikidataのpropertyだけでRoleを決めていない。

| 人物 → 作品 | 原資料の担当／候補Role | ISBN・根拠 | Claim ID |
| --- | --- | --- | --- |
| 池上遼一 → トリリオンゲーム | 作画／DRAWING | 9784098610105・[NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I031350948) | `cf18d898-41e5-486f-8dcf-8a666bef83fe` |
| Boichi → Dr.STONE | 作画／DRAWING | 9784088811840・[NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I028309496) | `fe6d7c19-646b-474a-ad0a-3b20bc816866` |
| 藤本タツキ → チェンソーマン | 著／AUTHORSHIP | 9784088817804・[NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I029534501) | `84cb19dd-9e8e-496f-abf6-674885abf185` |
| 遠藤達哉 → SPY×FAMILY | 著／AUTHORSHIP | 9784088820118・[NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I029763265) | `07da4e98-1047-46a4-b48a-30f3549c89f9` |

人間は、人物・漫画作品の同一性、第1巻の限定、原表記から既存Roleへの対応、NDL書誌の支持範囲を確認し、個別に受入／保留／却下を判断する。新規15 Entityの同定と受入も別に判断する。受入を選んでも、この実行の承認だけで公開適用は行わない。

## 保留11件と判断事項

全件 `unsupported-responsibility-role`。資料の取得失敗や関係不存在ではなく、承認済みadapterの意味変換対象外である。

| 分類・件数 | 対象 | 次の判断 |
| --- | --- | --- |
| 原作5 | 稲垣理一郎→[トリリオンゲーム](https://ndlsearch.ndl.go.jp/books/R100000002-I031350948)・[Dr.STONE](https://ndlsearch.ndl.go.jp/books/R100000002-I028309496)・[アイシールド21](https://ndlsearch.ndl.go.jp/books/R100000002-I000004050151)、大場つぐみ→[DEATH NOTE](https://ndlsearch.ndl.go.jp/books/R100000002-I000007330339)、ほったゆみ→[ヒカルの碁](https://ndlsearch.ndl.go.jp/books/R100000002-I000002788748) | 当該漫画の共同制作での原作担当か、原著由来かを個別に確認し、意味モデル・対応を別レビューする。著者・脚本・広い関与へ自動変換しない |
| 漫画3 | 村田雄介→アイシールド21、小畑健→DEATH NOTE・ヒカルの碁（根拠は上記各NDL書誌） | 「漫画」の担当範囲を確認する。作画と自動同一視しない。追加資料を使う場合はその資料と支持範囲を別に確認する |
| 監修2 | 手塚眞→[PLUTO](https://ndlsearch.ndl.go.jp/books/R100000002-I000007510854)、梅澤由香里→ヒカルの碁 | 監修の意味と対象範囲を別レビューする。両人とも今回の12人物アンカー外であり、自動追加していない |
| 集約著者1 | 「浦沢直樹 [ほか]著」→PLUTO | 完全な責任表示・担当を確認する。「ほか」を推測で補完しない。既存の受入済みPLUTO関係は保持 |

残り94作品、これらのRole追加、レシピ外人物、新しい資料取得は今回の承認範囲外。継続する場合は範囲・アンカー・入力・上限を固定した次版をレビューする。

## 検証と環境

- 既存 `public:validate` による一時公開形式の技術検証が成功。保持する候補の新規4 Claimはhiddenのまま、一時 `validation-only/` は削除済み。受入済みを意味しない。
- CLI `inspect` が32成果物のhashを検証。原応答28件も取得時hashと一致。同じ `run` の再実行は `unchanged: true`。通信試行28回・ジョブ試行1回のままで追加取得なし。
- 実行前のシェル起動でPATHの空白による構文エラーが1回発生したが、CLI・通信開始前。プロセス限定のPATH指定に直し、上記ジョブは1回で成功した。コード・固定入力の変更はしていない。
- Web変更・再build・VPS配置・公開releaseのapply・本番DB変更は行っていない。
- ローカル3200・日常確認先 `https://graph-beta.isinxnisi.com/`・正式 `https://plunode.net` で `/api/dataset` と `/api/entities?q=PLUTO` が全て200、PLUTOを検索できることを確認。ローカル／betaのrevisionは `82b01515-594c-48ca-b4b6-515eefac83ca`、VPSは `5e2a94af-9061-4087-bb7a-045a3c0133f4` のまま。承認・候補は管理用作業領域にあり、稼働Web・DBへの反映対象ではない。
- betaは初回Python urllib確認で403、続くcurl確認ではdataset・検索とも200。アクセス設定は変更していない。
