# r0002の受入推奨・公開準備資料

2026-10-17。**正式な個別受入・公開適用は未承認。** [個別受入レビュー](../../../docs/design/MANGA_R0002_ACCEPTANCE_REVIEW.md)と[制作Roleレビュー](../../../docs/design/MANGA_PRODUCTION_ROLE_REVIEW.md)を読むための機械可読控え。新しい管理・承認機構ではない。

- `review.json`：元ジョブのhash、15新規Entityの同一性推奨、既存5 Entity再利用、4 Claim推奨、11保留の再評価。人間の判断者はnull、formalAcceptanceはpending。元台帳を上書きしない。
- `proposed-records.json`：先行する4 Claimにつながる7新規Entity・4 Source・4 Citationの追加案。UUID・責任表示・ISBN scopeは元ジョブ由来。新規Entityの未確認別名・候補用説明を除き、4 Claimはhiddenのまま。全体snapshotではなく、baseへ合成するレコードの控え。
- `verification.json`：既存validatorの結果、ローカルKGへの読取り専用plan、関連34テスト、重複確認の範囲。技術検証であり受入記録ではない。

元ジョブは `.local/collection-jobs/famous-manga-creators-r0002-97c171eb654963e4/`、公開草稿は `.local/collection-trials/manga-r0002-review-20261017/hidden-draft/`。全snapshotをGitへ重複保存せず、上の追加案と既存凍結baseを保持する。

## 草稿の再構成

`proposed-records.json` の `baseDirectory` のdataを読み、recordsの各配列を同名配列へ追加してUUID順に並べる。baseのmanifestを引き継ぎ、releaseは草稿用の別ID、baseReleaseは元release、dataSha256はJSONの2スペース整形＋末尾改行のhashとする。4新規ClaimのclaimOriginsとreview.json／proposed-records.jsonの入力hashを加える。元ジョブ・既存releaseは編集しない。

草稿は新規Claimがhiddenなので、既存の `public:validate`／`public:plan`／`public:apply` にそのまま渡しても拒否される。未受入を撤回記録に変えない。今回の技術検証では、一時公開形式だけをvalidatorとlocal planへ渡し、終了時に削除した。公開可能な投影は保持していない。

正式受入後は、その時点の最新baseと選ばれたレコードで正式releaseを別途作る。人間の個別受入・公開適用承認・最新KG差分・バックアップを確認してから、既存public経路へ渡す。この資料をaccepted／人間承認済みとして扱わない。
