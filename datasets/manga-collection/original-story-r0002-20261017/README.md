# ORIGINAL_STORYの次の個別受入候補

新Roleの人間採用後、凍結r0002のNDL書誌を再確認した5件。[candidates.json](candidates.json) にClaim・Source・Citation・6依存Entityのレコードと、各判断・snapshot hashを保持する。**5 Claimはhidden・pending、人間の正式受入なし、公開releaseへ未収録。** 既存adapterとr0002の承認内容は変更していない。

| 人物 | 漫画 | 日本語第1巻ISBN |
| --- | --- | --- |
| 稲垣理一郎 | トリリオンゲーム | 9784098610105 |
| 稲垣理一郎 | Dr.STONE | 9784088811840 |
| 稲垣理一郎 | アイシールド21 | 9784088733708 |
| 大場つぐみ | DEATH NOTE | 9784088736211 |
| ほったゆみ | ヒカルの碁 | 9784088727172 |

同じNDL書誌内の明示的な「原作」・第1巻・ISBN・日本語・漫画を照合し、レビュー済み人物／作品UUIDを維持した。大文字小文字のタイトル表記差を許容した。原本実見ではなく書誌メタデータに基づく。各scopeは当該ISBNだけを示し、全巻・全版・脚本・ネーム・著作権を補完しない。同じRole・scope・SPOの既存Claimは0件。

トリリオンゲームとDr.STONEのSourceは正式受入したSourceを再利用する。他3 Sourceは候補。人物3名・作品3件の6 Entityは別途受入が必要。残り2 Entity（村田雄介・小畑健）も正式受入対象外のままであり、この原作候補の端点ではない。

[Role契約](../../../docs/design/ORIGINAL_STORY.md)、[全保留の次段階](../../../docs/design/MANGA_R0002_ACCEPTED_RELEASE.md)。個別受入後も公開releaseへの追加とapplyはそれぞれ別の確認を行う。
