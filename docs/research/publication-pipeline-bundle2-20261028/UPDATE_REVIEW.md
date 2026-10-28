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
