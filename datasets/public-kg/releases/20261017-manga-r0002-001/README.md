# 漫画r0002の受入済みrelease候補

baseRelease `20261014-credits-001`。追加7 Entity／4 Claim／4 Source／4 Citation／7 ExternalIdentifier、既存更新0。全既存知識・UUID・由来・撤回履歴を保全する。公開KGへのapplyは全環境で未許可・未実施。

```bash
python3 scripts/prepare-manga-release.py --check
npm run public:validate -- datasets/public-kg/releases/20261017-manga-r0002-001
npm run public:plan -- datasets/public-kg/releases/20261017-manga-r0002-001
```

生成する場合はPythonの `--check` を外す。人間の [正式受入記録](../../../manga-collection/accepted-r0002-20261017/acceptance.json) と参照hashを検証してから生成し、DBへ接続しない。元のhidden候補のうち承認された4 Claimだけをrelease内でpublishedへ変換する。原作5候補と未受入8 Entityは含まない。

[レビュー・検証・適用前の残作業](../../../../docs/design/MANGA_R0002_ACCEPTED_RELEASE.md)。適用時点のbaseRelease／revisionが変わっていれば再検証する。
