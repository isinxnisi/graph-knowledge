# 漫画r0003正式受入と40 Claim統合release候補

2026-10-17。プロジェクト運営者は20:25 JSTの本チャットで、[r0003レビュー](MANGA_R0003_ACCEPTANCE_REVIEW.md)の全推奨グループを正式受入した。**受入済み・公開KG未適用**。ローカル・ベータ・本番の公開applyは禁止のまま。

## 正式受入の正本

[acceptance.json](../../datasets/manga-collection/accepted-r0003-20261017/acceptance.json)に判断者「プロジェクト運営者」、指示日時、実際の記録日時 **2026-10-17T20:41:30+09:00**、全対象UUID・Claim意味とscope・参照artifact SHAを記録した。過去のCodexレビューを人間承認に読み替えていない。reviewer／recordedAtがnullの過去decision-requestは凍結したままであり、現在の受入状態は今回の別記録を参照する。

| 対象 | r0003今回受入 | r0002既受入 | 現公開baseからの統合追加 |
| --- | ---: | ---: | ---: |
| Entity | 39 | 13 | 52 |
| Claim | 31 | 9 | 40 |
| Source | 26 | 7 | 33 |
| Citation | 32 | 9 | 41 |
| ExternalIdentifier | 39 | 13 | 52 |

r0003 ClaimはAUTHORSHIP18・DRAWING6・ORIGINAL_STORY5・CREATION2。r0002を含む40件はAUTHORSHIP20・DRAWING8・ORIGINAL_STORY10・CREATION2。新規Entity39件はレビュー済みの同一UUIDで受入し、r0002の藤本タツキ・大場つぐみ・Boichiと、公開済みの人物・作品を再利用する。候補の収集時刻だけを理由に既受入Entityを上書きしない。

## 判断条件と未受入の例外

- パイナップルARMYは公開作品UUID `290ab095-192d-4910-90f3-ae741f9d1f32` を再利用。収集時の別UUIDを追加せず、承認済み対応後の2 Claim／Citation UUIDを使用する。既存ISBN9784091921116と追加ISBN9784091810816は別scope。Q1096269の付与は別判断で、既存Entity.externalIdsは空のまま。
- 童夢はISBN9784065262634・scope「全集第8巻（童夢）」、元NDLと出版社の2 Citationを保持。作品と全集の対応を全全集・漫画第8巻・旧版へ広げない。
- 小畑健は追加の出版社資料に基づくISBN9784086196901のAUTHORSHIPのみ受入。人物Entityは今回正式受入されたが、DRAWINGは未受入。
- 【推しの子】は赤坂アカORIGINAL_STORY／横槍メンゴDRAWING。対象workに対するISBN未指定のscope=nullを維持し、主にという原語、periodの未指定を保持する。第1巻ISBN・全巻全版・全期間・排他的担当を補わない。
- 元の小畑「漫画」／推しの子「集約著者」の責任表示2行は保留のまま。村田雄介の人物・未受入制作関係、梅澤由香里の同定／監修、残り70作品の次版収集実行も今回の受入に含めない。

Source3件のnoteに残っていた候補状態の注記だけを正式受入済みへ更新し、変更前後・理由を受入記録へ残した。Source／Citation UUID・書誌・原責任表示・locator・言語・根拠範囲は維持。新規31 Claimのvisibilityは受入済みrelease artifact内だけpublishedにし、元レビューのhidden31件は変更しない。公開DBへ書き込んだことを意味しない。

## 統合releaseと無書込検証

候補は[新release 20261017-manga-r0003-001](../../datasets/public-kg/releases/20261017-manga-r0003-001/manifest.json)、baseReleaseは現公開 **20261014-credits-001**。未適用20261017-manga-r0002-002は、既受入追加集合として取り込み、適用済みbaseとして扱わない。旧-001／-002、元収集・承認・レビューartifactは不変。

既存 `scripts/prepare-manga-release.py --r0003` を追加し、今回の受入記録・承認されたdecision hash・全対象ID／scope・同一性対応・Source編集注記・凍結参照hashを検査する。旧r0002は既存のbuild／--combinedで独立に再現確認し、全レコード・UUID・Claim origin・撤回履歴を維持する。同一ID／外部ID・Source URLの衝突、未受入の混入、Pineapple別UUID／QID付与を拒否する。新releaseの既存ファイルに内容差があれば上書きしない。

```bash
python3 scripts/prepare-manga-release.py --r0003 --check
python3 scripts/prepare-manga-release.py --combined --check
python3 scripts/prepare-manga-r0003-review.py --check
npm run public:validate -- datasets/public-kg/releases/20261017-manga-r0003-001
npm run public:plan -- datasets/public-kg/releases/20261017-manga-r0003-001
```

| 検証 | 結果 |
| --- | --- |
| public:validate | 成功。2161 Entity・1884 Claim・1784 Source・1921 Citation・2530 ExternalIdentifier |
| ローカルpublic:plan | 追加218知識Node・214 Relationship、既存更新0。暗黙削除・意味変更・二重取込なし |
| 実KGの前後backup | savedAt以外の全payload一致。release・revision・全知識・外部ID UUID・撤回・receipt・identity履歴を維持 |
| Python受入・レビュー試験 | 14件成功。対象拡張、意味／scope変更、apply権限拡大、記録時刻不正、根拠hash不足、歴史レビュー上書きを拒否 |
| 既存public／制作Role単体 | 34件成功。合計48テスト |

全対象ID付き[local-plan.json](../../datasets/manga-collection/accepted-r0003-20261017/local-plan.json)、[release-validate.json](../../datasets/manga-collection/accepted-r0003-20261017/release-validate.json)、[verification.json](../../datasets/manga-collection/accepted-r0003-20261017/verification.json)を保持する。新releaseに受入対象以外の追加・旧レコード更新はない。Source／Citation参照は閉じており、r0002と同一のSourceやEntityは再利用する。

実ローカルのbase revisionは82b01515-594c-48ca-b4b6-515eefac83ca。3200・ベータの/api/datasetは200で同revision、本番HTTPSも200・revision 5e2a94af-9061-4087-bb7a-045a3c0133f4を維持。今回はWeb／operatorのbuild・配置、VPS変更、会員DB変更を行わない。VPSの現地planは未実施で、HTTPSのrevision確認を全DB／operator互換性検証の代わりにはしない。

## 代表的なGraph探索経路

以下は全接続が**正式受入済み・公開未適用**へ進んだ経路。公開KGで実際に辿れた経路ではない。

| 経路 | 独立ClaimのRole（矢印順） |
| --- | --- |
| 池上遼一 → サンクチュアリ ← 武論尊 → 北斗の拳 | DRAWING／ORIGINAL_STORY／CREATION |
| 赤坂アカ → 【推しの子】 ← 横槍メンゴ → クズの本懐 | ORIGINAL_STORY／DRAWING／AUTHORSHIP |
| 大場つぐみ → DEATH NOTE／バクマン。 | ORIGINAL_STORY／ORIGINAL_STORY |
| 萩尾望都 → ポーの一族／11人いる！ | AUTHORSHIP／AUTHORSHIP |

計10接続のEntity UUID・Claim UUID・Role・scope・Citation／Source UUID・受入版をverification.jsonに記録した。逆向き矢印は同じ独立Claimを作品側から辿る表記であり、新しい逆Claim・人物間の直接関係を生成しない。刊行物scopeの違いは各接続に保持する。ほかに藤本のチェンソーマン／ファイアパンチ、BoichiのDr.STONE／ORIGINなども正式受入済み追加集合で接続可能になる。

## 公開前の残作業と次の自動化

公開applyは別の明示指示を待つ。その前に適用先ごとの最新backup／baseRelease／revisionと撤回履歴、Web／operatorのORIGINAL_STORY互換性を確認し、対象releaseのvalidate・最新状態への無書込planを再実行する。baseが変われば今回の古いsnapshotをそのまま適用せず、新状態から再検証・新release IDで準備する。公開後に初めて適用release／実revisionと実探索経路を確認して記録する。

[次の実装タスク](COLLECTION_THEMES.md#次の実装タスク収集からレビュー受入からrelease準備)は、既存CLIをつなぐ2段階の薄いラッパーとする。今回は受入対象が確定したr0003を既存release generatorへ接続するところまで実装し、汎用収集→レビュー連続処理や将来の受入CLIは次の範囲として切り出す。新しい画面・API・ジョブDB・AIサービスは導入しない。
