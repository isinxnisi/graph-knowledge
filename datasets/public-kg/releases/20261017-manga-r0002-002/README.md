# 漫画r0002の9 Claim統合release候補

現在の公開版 `20261014-credits-001` をbaseに、正式受入した13 Entity・9 Claim・7 Source・9 Citation・13 ExternalIdentifierを追加する候補。旧候補 `20261017-manga-r0002-001` は未適用の履歴として保持し、上書きしない。全既存知識・UUID・接続・公開状態・由来・撤回履歴は不変。

```bash
python3 scripts/prepare-manga-release.py --combined --check
npm run public:validate -- datasets/public-kg/releases/20261017-manga-r0002-002
npm run public:plan -- datasets/public-kg/releases/20261017-manga-r0002-002
```

生成時だけ `--check` を外す。`--combined` を省略すると旧4 Claim候補の生成・照合になる。両方の正式受入記録と原資料hashを確認し、元の候補台帳は変更せず、今回の5 Claimの新規Citationから古い「未受入候補。」の状態注記だけを除く。

公開検証・実KGの無書込planは成功。追加51知識Node・49接続、既存更新0。未受入2人物・制作関係・監修関係は含めない。**ローカル・beta・本番VPSとも公開applyは禁止・未実施。**

[原作5件の正式受入](../../../manga-collection/accepted-original-story-r0002-20261017/acceptance.json)、[先の4件の正式受入](../../../manga-collection/accepted-r0002-20261017/acceptance.json)、[検証・探索経路・公開前の残作業](../../../../docs/design/MANGA_R0002_COMBINED_RELEASE.md)。適用指示を得た後にも最新baseRelease・revision・backup・対応Web／operatorを再確認する。
