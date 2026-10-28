# 固定更新の判断対象

今回は実装候補の作成まで。設置・稼働Worker更新・main統合・Web切替・個別公開を承認済みとは扱わない。

最初の必要操作は [VPSの読取inventory](READONLY_INVENTORY.md)。現在のprotected config/manifestと実containerが既知の設置版から変わっていないことを確認し、設定後bytesを確定する。Codexの非対話SSHは認証拒否のため、ここだけ運営者のSSH/sudoが必要となる。既存の認証・権限設定は広げない。

その結果を確認後、次の固定対象を一つの更新判断資料へ揃える。

|配置先|変更候補|保持するもの|
|---|---|---|
|Web|静的Role生成とread-only能力endpointを含む検証済みimage|既存意味/表示/scope/保存形式、会員機能、env、KG、DB|
|VPS root gate|executor/cycleの2ファイル、program manifest、operator image、互換必須flag|既存wrapper、SSH mode/sudoers、鍵、nonce/署名/監査/journal|
|WSL delivery|固定source追加、delivery configのsource/image/policy、保護approverの診断差分|鍵、個別公開TTY確認、既存job/request、pause/peer契約|
|Windows Task|既存Delivery TaskのAction末尾sourceのみ|launcher、trigger、principal、settings、Worker/WorkStatus Task|
|固定Worker|contribution domain/i18n、生成Role module、互換server module/CLIの5ファイル|base pin、collector、全旧依頼・承認・12 receipt|

`ops/prepare-publication-bundle2-assets.py` はこの候補source、検証済み2 image、Worker before/after、root code before/after、設定後JSONとreceipt集合を私有directoryへ固定する。install・署名・applyしない。VPS inventory未取得で作った資材は `vpsFreshInventoryConfirmed:false` / `installationAuthorized:false` とし、完全な設置承認票として扱わない。

過去の正式公開2回を取り消したり再署名したりする操作は不要。未収録映画の新規受入と個別公開はこのコード更新判断と別であり、今回の承認対象へ含めない。

固定SHA・image archive・私有資材の場所は資材生成後に以下へ記録する。


## 固定済み候補資材（設置承認票は未確定）

source commit: `fe3fcb6a3b00ede3dfbf122e124f87da38f9f736`

私有directory: `/home/isinxnisi/1.projects/.worktrees/graph-knowledge-publication-pipeline-bundle2/.local/publication-pipeline/update-assets-final`

- SHA256SUMS SHA-256: `41fcc72896c9faf1390771dff039ba61349eeb9ecd73dcb089a07414d47fd9f7`
- deployment.json SHA-256: `262d8ca196a2008c8b59e1f0aa5178fb6f4d3aa0017394d26f812b5e78133402`
- source.tar SHA-256: `63e767fa3e0b4a113e8d40ae5b5336401edafc2cb9463f332c2b67781a06c0d2`
- VPS新規inventory: **未確認**。`vpsFreshInventoryConfirmed:false`、`installationAuthorized:false`。

2 imageのarchiveはIssue33由来の既存verifierでconfig/OCI/layer bytesを検証済み。最終資材はこれをそのまま再利用し、再build・再saveを行っていない。中間のupdate-assets-01はimage再利用元であり、設置対象にしない。

|image|WSL config ID|VPS load後のOCI ID|archive SHA-256|
|---|---|---|---|
|operator|`sha256:eed48775a9ff6b790c18b9611c8b04003f2137cabb5fd608e1fb04881a3088a2`|`sha256:8099094f5a0bdce1cd322539557ef8cc849e1f4949997f1ba53304d898aac006`|`2ef9964fb61504e4efdf4ba775bad76915106767e54022a0dbe4ed908b4890cf`|
|Web|`sha256:7f25fc2f6df0155802db3cd1c17f5de461f2b0dd2fc9abe0dc7d6549fffb952e`|`sha256:f4e2a8e484c6c9906d89f163614567007d5b35575c5ac05976434edb238a52d4`|`714245265b3dc3e3fbd436a6b4e52d15b47a6d6adb95b8d68c3f9ef60038abff`|

全file差分・Worker before/after・12 receipt hashは [results/update-assets.json](results/update-assets.json)。VPS inventory受領後にCodexが一致確認し、root config後bytesと既存状態の差分を確定して、設置対象をまとめて再提示する。この未確認状態で上記hashへの設置承認を求めない。

運営者が今行う操作はREADONLY_INVENTORY.mdの読み取り1回だけ。署名・apply・切替は行わない。成功時はprogram files一致、operator/実Web imageとNode、現在revisionのJSONが得られる。
