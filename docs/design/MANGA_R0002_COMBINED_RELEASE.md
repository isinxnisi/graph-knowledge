# 漫画r0002：原作5件の正式受入と9 Claim統合候補

2026-10-17。人間による追加の正式受入指示を記録した。対象は指定のORIGINAL_STORY 5 Claimと6 Entity、および再確認した必要Source・Citationだけ。原作Roleの意味は[採用済み契約](ORIGINAL_STORY.md)を維持する。**ローカル・beta・本番VPSとも公開KGへのapplyは禁止・未実施。**

## 今回の正式受入

判断者は「プロジェクト運営者」。判断記録日時は 2026-10-17T10:34:25+09:00。過去のCodexレビュー時刻を承認時刻へ読み替えない。[acceptance.json](../../datasets/manga-collection/accepted-original-story-r0002-20261017/acceptance.json)に対象UUID、判断内容、参照artifactのSHA-256、ISBN scope、Source共有、注記の編集前後を保存した。

| 人物→作品（ORIGINAL_STORY） | 日本語第1巻ISBN | Claim UUID |
| --- | --- | --- |
| 稲垣理一郎→トリリオンゲーム | 9784098610105 | c3f1e013-68cc-42b7-b076-495178247899 |
| 稲垣理一郎→Dr.STONE | 9784088811840 | f638cf0b-3750-49f6-b833-844d5465b99f |
| 稲垣理一郎→アイシールド21 | 9784088733708 | 043e8592-5827-4167-9c93-f8201dd110bc |
| 大場つぐみ→DEATH NOTE | 9784088736211 | 6ed29ee4-2b62-4fe7-83a6-aafe300754d7 |
| ほったゆみ→ヒカルの碁 | 9784088727172 | 10f72eb0-3526-4d50-a552-e2239c01fc39 |

新規6 Entityは稲垣理一郎・大場つぐみ・ほったゆみ・アイシールド21・DEATH NOTE・ヒカルの碁。既存レビューのUUID・QID・確認済み名称／別名を維持し、説明の推測を追加しない。トリリオンゲームとDr.STONEは先の4 Claimに伴って受入済みの作品Entityを共有する。

凍結NDL書誌の同じレコードで日本語・漫画・第1巻・ISBN・「本人名 原作」を再照合した。原本実見とは区別し、刊行日から制作期間を補完しない。scopeは当該刊行物だけで、全巻・全版へ広げない。元の候補台帳・原資料・原責任表示・UUID・locator・languageは不変。

新規Sourceは3件（アイシールド21・DEATH NOTE・ヒカルの碁のNDL書誌）、新規Citationは5件。トリリオンゲームとDr.STONEの2 Sourceは先に正式受入した未適用候補のSource UUIDを共有する。現行公開KGとの同一Role・scope・SPOの重複0、Source URLの二重生成0、Entity ID／外部ID衝突0。PLUTOの既存重複2 Claimも再生成していない。

新規5 Citationのnoteから「未受入候補。」という編集上の状態注記だけを除去した。これは資料原文ではなく、正式受入後の公開候補に誤った状態を表示しないための修正。残る根拠範囲の注意、原責任表示・scope・接続・Citation UUIDを保持し、元の候補ファイルは変更しない。Source共有を独立資料数の増加と解釈しない。

## 新しい統合release候補

新候補は `20261017-manga-r0002-002`。現在の公開KGは引き続き `20261014-credits-001` であり、**baseReleaseは `20261014-credits-001`** とする。未適用の `20261017-manga-r0002-001` をbaseにはしない。旧候補のdata／manifest・受入記録はhashを照合して履歴として保持する。

| 対象 | 現行公開版からの追加 | 旧候補-001からの差分 | 統合後の合計 |
| --- | --- | --- | --- |
| Entity | 13 | 6 | 2,122 |
| Claim | 9 | 5 | 1,853 |
| Source | 7 | 3 | 1,758 |
| Citation | 9 | 5 | 1,889 |
| ExternalIdentifier | 13 | 6 | 2,491 |

既存の公開release方式と生成スクリプトを拡張し、`--combined` 指定でのみ-002を生成する。両方の正式受入記録、凍結資料hash、固定対象ID・件数、scope、Source共有を検証し、旧候補-001を変更せず9 Claimを統合する。新しい収集管理機構やadapter変更はない。元のhidden候補は保持し、正式受入に基づいて新releaseの中だけpublishedへ変換する。これは公開KGへの適用ではない。

```bash
python3 scripts/prepare-manga-release.py --combined --check
npm run public:validate -- datasets/public-kg/releases/20261017-manga-r0002-002
npm run public:plan -- datasets/public-kg/releases/20261017-manga-r0002-002
```

最新KGを無書込backupで再取得し、releaseのfixtureと完全一致、撤回0を確認。revisionは `82b01515-594c-48ca-b4b6-515eefac83ca`。private backupは `backups/manga-r0002-before-combined-20261017.json`、checksumは `6b58122b9e3ce40b988184f8e0600803aa1fd8c2f0f16875483ceba5cae3a4a4`。旧UUID・Claim・Source・Citation・接続・公開状態・由来・撤回履歴は保全した。

`public:validate` と実KGへの無書込 `public:plan` は成功。追加51知識Node／49 Relationship、既存更新0。[planの全対象ID](../../datasets/manga-collection/accepted-original-story-r0002-20261017/local-plan.json)と[公開検証](../../datasets/manga-collection/accepted-original-story-r0002-20261017/release-validate.json)を保持する。適用時点のbaseRelease・revisionが変わっていれば、新しい状態で再レビュー・再生成・planを行う。

## 公開後に辿れる関係と保留

次の経路をrelease fixtureで検証した。現在の公開KGへはまだ追加されていない。矢印は保存されたClaimの方向であり、探索自体は両方向にできる。

- 池上遼一 → DRAWING → トリリオンゲーム ← ORIGINAL_STORY ← 稲垣理一郎 → ORIGINAL_STORY → Dr.STONE ← DRAWING ← Boichi
- 稲垣理一郎 → ORIGINAL_STORY → アイシールド21
- 大場つぐみ → ORIGINAL_STORY → DEATH NOTE
- ほったゆみ → ORIGINAL_STORY → ヒカルの碁
- 藤本タツキ → AUTHORSHIP → チェンソーマン、遠藤達哉 → AUTHORSHIP → SPY×FAMILY

トリリオンゲームとDr.STONEでは、同じ日本語第1巻の原作・作画を別Claimとして確認できる。共有作品を介した経路は人物同士の直接の共同制作Claimではない。大場／ほった／藤本／遠藤の各人物作品組は、今回の追加だけで他の作者群につながるわけではない。

村田雄介・小畑健の2 Entityと未受入制作関係、「漫画」表記の正規化判断、梅澤由香里の監修・人物同定は保留のまま。小畑健を介してDEATH NOTEとヒカルの碁を結ぶ経路はまだ作らない。残り94作品の実行承認はなく、r0002の定義・adapter・code/input hash・実行履歴を維持する。将来の収集拡張は別の実行版のレビューを経る。

## 検証と公開前の残作業

関連5 file・26テスト（新規統合release4件を含む）、型チェック、lint、語彙／限定契約検証が成功。元候補と-001の不変、新旧全レコードと撤回履歴の保持、Source再利用、承認・hash・base・未受入混入の拒否、原作と作画の非同一視と探索経路を確認した。テストはfixtureと一時ファイルを使用し、DBへのapply・seed・migrationは実行していない。

本作業は受入記録・release生成・無書込検証に限定し、Web／operatorの新規buildや配置は行わない。公開前には別途apply指示、最新backupとbase／revisionのplan、対応するWebとoperatorの配置確認が必要。VPSへのSSH到達・対応版配置の確認をKG適用の承認と混同しない。

最終の環境確認とartifact hashは[verification.json](../../datasets/manga-collection/accepted-original-story-r0002-20261017/verification.json)を参照。

### 確認環境とVPSの独立した準備状態

確認時にローカル3200が停止していたため、既存build `KSXBMOh_sRI9ZhWrXwsGG` と既存 `.env.public` でWebだけを再起動した。再build、migration、KGのapplyは行っていない。ローカル／betaは同build・revision `82b01515-594c-48ca-b4b6-515eefac83ca` を返し、ORIGINAL_STORY条件は200・該当0件。betaの既存実ブラウザ1件も成功した。今回受入済みの9 Claimはまだ公開KGに収録されていない。

VPSのHTTPS dataset APIは200・revision `5e2a94af-9061-4087-bb7a-045a3c0133f4` を維持する。一方、同じORIGINAL_STORY条件のAPIは400であり、対応Webの配置完了とは扱わない。このWSLから既存VPSへSSHするとport22で `No route to host` となったため、現地無書込planとoperator対応状況の実検査は未実施。SSH設定・権限の変更、Web／operatorの転送・配置は行っていない。

公開前にVPS接続を確認し、ORIGINAL_STORYを扱えるWebとoperatorをそれぞれ照合する。既存credits operatorは7 Role時点の配置物であり、新候補の検証には対応版が必要。別作業のWeb配置準備があることだけでoperator対応済みとは判断しない。これらの復旧・配置の確認が終わっても、公開KGへのapplyには別の人間指示が必要。
