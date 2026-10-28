# 固定更新一式の運営者判断

2026-10-28、運営者が既存SSH／sudoで固定exporterを実行し、返却JSONをCodexが照合した。追加の読取操作は不要。現時点では設置・main統合・Web切替・署名・applyを行っていない。

## 実測と照合

|対象|確認結果|
|---|---|
|VPS gate|設置元 `0732af9ebd87f2cd73a033246e88d25493d4ba2a`。program manifestと実ファイル11件すべて一致|
|現在operator|設置元 `4eee46a0ab16f9828de41b5c69147425b0623004`。実image `sha256:7042781b105067ce3adea0c59bccfb4c8326f84c0ca6aa5f1b8c26e6cd3d5cef`、Node `v24.21.0`|
|現在Web|3200を公開する `/graph-knowledge-production-web-1` の実image `sha256:8803c499a7d511621eb7293d5e1e21dd21ba35253d5a2a6700a9ee7fa50ecc25`。Issue #54の既知の設置版、Node `v24.21.0`|
|本番KG|revision `f5dbf83f-c89e-4e40-95ee-57957016089f`。運営者のVPS取得結果と現在HTTPS APIが一致|
|既存状態|全12 receipt・固定Worker config保持。過去2 nonceは改めてcompleted、再署名・再apply不要と確認|
|main|ローカルHEADとremote mainは `129c1eb411cece336cce02996c520f8f21b12f0a`。今回の実装は専用branchのみ|

原データは [inputs/vps-installed-inventory.json](inputs/vps-installed-inventory.json)、照合結果は [results/vps-inventory-verification.json](results/vps-inventory-verification.json)。入力は運営者の返却JSONを整形保存したものであり、原stdoutのbytes/hashを取得したとは扱わない。新候補の本番設置後のpreflightは、更新承認後に別途実測する。

## 承認対象

[update-decision-request.json](update-decision-request.json) SHA-256:

```text
142a0dd04342b5429cc9dd736804965646bb6da9e39e7573a2065c97f02fab82
```

source commit: `fe3fcb6a3b00ede3dfbf122e124f87da38f9f736`

|配置先|固定した更新範囲|保持条件|
|---|---|---|
|main／3200／beta|固定実装の統合と既存契約による確認環境への反映・検証|未受入branchの直接配置なし。データ・環境設定・会員storage保持。統合で承認対象のcode/image入力が変われば停止|
|本番Webのみ|検証済みWeb archiveを再利用してimageだけ切替|KG・会員DB・env・AI artifactを保持。DB migrationなし|
|VPS gate／operator|executor/cycle 2ファイル、固定program manifest、operator pin、互換検証必須flag|既存wrapper・SSH／sudoers・鍵・deploymentEnabled・nonce／署名／監査／journal保持|
|WSL delivery／保護approver|固定source追加、固定delivery config、診断を追加したapprover|署名鍵、個別公開のTTY確認、既存job／request、pause／peer契約保持|
|Windows Task|`Plunode-Publication-Delivery` のAction末尾sourceだけ更新|既存launcher・trigger・principal・settings保持。Worker／WorkStatus Taskは変更しない|
|固定CollectionWorker|contribution domain/i18n、生成Role module、互換server module/CLIの5ファイルだけbackport|base pin・collector・既承認依頼・承認・12 receipt・coordinator／peer契約保持|

before/afterのfile hashは判断票と [results/update-assets-vps-confirmed.json](results/update-assets-vps-confirmed.json) に固定した。Roleの意味・scope、Entity/Claim受入、本番公開署名、KG apply/restore、会員migration、鍵・権限変更はこの判断の対象外。

### VPS設定の固定方法

設定全文は持ち出していない。次の入力hashと2項目だけの変換を固定対象とし、出力設定SHAは承認後の適用時に記録する。出力bytesのSHAを今取得済みとは扱わない。既存の固定入力＋限定変換によるpin更新方式を使い、承認契約を広げない。

入力 `/var/lib/plunode-publication/trusted/config.json` SHA-256:

```text
c15a21f30206bd741658a0ef190ff3d80f9918c21c5f928264cc60cbf7284946
```

変更は `operatorDigest` → `sha256:8099094f5a0bdce1cd322539557ef8cc849e1f4949997f1ba53304d898aac006`、`compatibilityRequired` → `true` だけ。それ以外の値は保持する。serializationはPython `json.dumps(ensure_ascii=False, indent=2) + LF` のUTF-8。新program manifestでも `compatibilityRequired:true` を束縛する。

## 固定資材

私有directory:

```text
/home/isinxnisi/1.projects/.worktrees/graph-knowledge-publication-pipeline-bundle2/.local/publication-pipeline/update-assets-vps-confirmed
```

|資材|SHA-256|
|---|---|
|SHA256SUMS|`f9636c957b2566575ee89266bcd1901e155dbb35aa6e2d342080568bf167a2af`|
|deployment.json|`0a1718eabd0b02e401354a0801c1be40bb357d2418cb73bed8d3270afd054a46`|
|program-manifest.after.json|`89a62a0cb7ed7974e48130c27ab4387bab5ec215ea7b683bec284d407664954b`|
|delivery.after.json|`1b4e49af35cd3c7377f1d8e0fcf10c94b09dea243dbba6c32d2d4c409a95e9e3`|

|image|WSL config ID|VPS load後OCI ID|
|---|---|---|
|operator|`sha256:eed48775a9ff6b790c18b9611c8b04003f2137cabb5fd608e1fb04881a3088a2`|`sha256:8099094f5a0bdce1cd322539557ef8cc849e1f4949997f1ba53304d898aac006`|
|Web|`sha256:7f25fc2f6df0155802db3cd1c17f5de461f2b0dd2fc9abe0dc7d6549fffb952e`|`sha256:f4e2a8e484c6c9906d89f163614567007d5b35575c5ac05976434edb238a52d4`|

以前の `update-assets-01` / `update-assets-final` は中間資材。今回の設置判断対象へ混在させない。image archiveは検証済みの同じbytesを再利用し、再build・再saveしていない。全assetのhash、program manifestの限定差分、Worker既存ファイル・全12 receiptとの対応を照合した。コードは前回の96件＋74件＋30件成功時から変更していないため、同じbuild・試験を重複実行していない。

## 運営者が次に行うこと

稼働版・root保護コードの更新に入るため、固定対象への明示判断が必要。今必要なのは上記判断票への承認または保留であり、追加のSSH／sudo読取は不要。

承認する場合の指定例:

> 判断票SHA-256 `142a0dd04342b5429cc9dd736804965646bb6da9e39e7573a2065c97f02fab82` の固定更新一式を承認します。記載されたmain／確認環境／本番Web-only／VPS gate・operator／WSL delivery・approver／Windows Delivery Task／固定Worker 5ファイルの更新を進めてください。データ受入・公開署名・本番KG apply・権限変更は含みません。

承認後はCodexが固定対象・通常idle・未完了nonce／exclusion／監査・最新receiptとbefore hashを再確認して進行管理する。既存権限でできる準備・main統合・確認環境検証を済ませ、SSH／sudo・Windows権限が必要な操作だけを既存経路の一括コマンドとして提示する。運営者の実行後は結果を照合する。これらの操作は現在未実施。

不一致・新たな意味／同一性判断・承認対象bytesの変更があれば、その対象を代替せず停止する。復旧は [RECOVERY.md](RECOVERY.md) に従い、鍵・journal・receiptを過去へ戻さない。未収録45記録・65 Entity候補の回収はこの更新判断待ちで止める必要はない。
