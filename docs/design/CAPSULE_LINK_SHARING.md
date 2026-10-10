# 特定版のCapsuleを限定リンクで渡す

2026-10-09採用。会員Capsuleの限定共有をローカルで試す初回。外部公開・一般公開検索・discussion・人間受入は別の段階。

2026-10-10追記：discussionは[版別コメント契約](CAPSULE_DISCUSSION.md)を追加した。既存リンクは読取のままで、作成者が明示して受付を開始した場合だけログインUserが投稿できる。以下のdiscussion未実装は共有初回当時の範囲。

## 選択と縦経路

会員編集初回が完了したため、新参照追加・プロフィール設定と比較し、別の人へ説明付き関係図を渡す体験を優先した。main側 `/home/isinxnisi/1.projects/7.graph-knowledge/docs/design/COMMUNITY_VERTICAL_SLICES.md` を読み取り専用で参照した。[Capsule構想](CAPSULE_AND_USER_CONTRIBUTION_VISION.md)と[会員保存](MEMBER_CAPSULES.md)の境界を維持する。

本人の `/member` 閲覧 → 表示中の版の共有を確認 → リンクをコピー → 匿名の別ブラウザで `/shared` → 説明・選択Graph・独立Claim／Source → 対象から別タブでExplorer、をつなぐ。所有者は共有状態・対象版を確認し、停止または現在版で再発行できる。コピー／外部送信は利用者の操作であり、発行だけで第三者へ通知しない。

## 意味・版・保存

- サーバーが受理済みの現在版だけを共有する。利用者が確認した `expectedRevision` と現在版が違えば409。title／note／language／dataset／Entity・Claim参照を固定し、後のprivate編集を共有先へ反映しない。
- 知識本文は保存しない。共有内容も現在のKG読取権限でEntity・published Claimを再取得する。未解決・取得失敗・構成外端点は既存Readerで表示する。説明・共存する対象・共有操作からKG Claim・支持・Global受入を生成しない。
- `member_capsule_revision` は明示共有した時点だけの内容snapshot。安定対象はCapsule UUID＋revision。共有済み版は更新しない。全編集履歴やKGの歴史版を保証しない。
- `member_capsule_share` はCapsuleごと同時に1件。別のUUID、対象revision、256bitの乱数tokenのSHA-256、作成日時を持つ。token平文を保存しない。停止時はlink行を削除し、再発行は新token・新link IDへ置換して旧リンクを失効する。どちらもCapsule行lockの下で実行する。
- snapshotはCapsuleごと50版まで。上限でも既存版の再発行と停止はできる。停止後もsnapshotは保持するが、所有者・匿名いずれにも過去版列挙APIは提供しない。Capsule削除でsnapshot／linkも同一DB内の外部キーで削除される。削除後再送の既存receiptは維持する。
- 初回の設定は既存会員機能と同じ。通常無設定ではAPIは503で、一般KG探索は動く。追加migration `002-capsule-sharing.sql` を専用PostgreSQLへ明示適用する。既存保存・KG・認証schemaを変換しない。戻す時は共有導線／APIを停止して追加tableを保持でき、自動DROPは行わない。

## 認可・URL・エラー

- `/api/member/capsules/:id/share` GET（状態のみ）／POST（発行）／DELETE（停止）。private操作ごとに既存DB session・active・owner・datasetを検証。UIは期待利用者headerを送る。変更は完全一致Originが必須で、ownerの自己指定を受け付けない。
- POSTは `{expectedRevision, expectedShareId}`（未共有はnull）。DELETEは `{expectedShareId}`。別画面でリンクが変われば409。発行・停止を同じCapsule行lockで直列化し、古い画面から新しいリンクを無条件に消さない。停止済みの停止再送は成功する。発行の自動再送はしない。
- 発行応答消失後は結果不明とし、状態を再確認してから再発行／停止する。token平文を取り戻すAPIはない。再発行前に旧リンクが失効することを明示し、新しいリンクを渡す。
- 読取は `/api/shared/capsule` GET＋`X-Capsule-Token`。cookieなしで有効tokenに結びつく版だけを取得する。現在版・非共有版・ownerの名前やメール・private一覧を返さず、tokenで更新・削除・発行できない。
- URLは `/shared#<token>`。fragmentはHTTP URLに含まれず、server／proxyの通常URLログやRefererへ載らない。APIに専用headerで送る。header／response本文をログへ収集しないことは公開時の運用条件。ブラウザ履歴・コピーしたURL・受け取った人の再転送には残り得る。
- `/shared` は内容を含まない殻をSSRし、token／内容はclientでだけ扱う。ページとAPIをno-store／noindex／nofollow／noarchive／no-referrerにする。metadataに題名・説明・URL秘密を載せない。noindexは認可の代用ではない。
- 不正・失効・別dataset・所有者active=false・Capsule削除は同じ404。DB／会員機能障害は503。一般の認証Userでもtokenなしに共有本文を読めない。停止したUserを再有効化すれば未失効リンクも復帰するため、恒久停止にはリンク失効も必要。
- 共有解除でprivateへ戻す操作はlink行削除。運営によるCapsule単位の非表示・監査・通報の操作は未実装であり、User停止をそれらの代用UIとして提供しない。

## 画面の寿命・既存探索

共有制御は会員の閲覧時だけ表示し、編集時は閉じる。会員タブ非表示／失効では親画面とともに内容・発行tokenを破棄し、復帰時に本人と状態を再認可する。リンク全文の再表示はできないことを画面に示す。通常のprivate編集入力保持は不変。

共有Readerはタブ非表示で本文・取得を破棄し、復帰／bfcache／hash変更／明示再確認でtokenを確認する。表示中も30秒ごとに再認可し、失敗時は本文を閉じる。各要求は15秒上限。古いtokenの遅い応答や取消後の応答を描画しない。すでに取得されたコピー・記録まで回収できるという約束はしない。

有効性の定期確認で同じsnapshotならReaderを維持し、選択・根拠・Graphを初期化しない。内容・tokenをlocalStorage／sessionStorageへ保存しない。Source／対象の外向き導線はnoreferrer。共有Readerは編集／取込／近傍自動展開をしない。既存Explorerは別タブで保ち、共有元に戻っても探索stateを変更しない。

## 検証と残り

実OIDC・一時PGの所有者／匿名／別User、Origin・期待利用者、共有版の固定、非共有更新の隔離、同時発行、古いlinkからの停止／再発行競合、停止再送、削除cascade、active停止、別dataset、50版上限、migration再実行を検証する。ブラウザでは390／1440pxで作成→別context→根拠→探索→private編集→明示再発行→停止を確認し、URL／Referer・cache・index指示・失敗後非表示も見る。

公開前にはheaderを含むログ収集／頻度制限／保持・削除方針／通報・運営非表示を具体化する。実Google・実KGブラウザ接続・人間受入・公開は今回実施しない。将来のdiscussionはCapsuleを安定対象とし投稿時revisionを保持するが、今回thread・postや空の投稿UIは追加しない。非共有過去版の読取権限を、保存済みsnapshotの存在だけから広げない。

### 実施結果

- 通常単体461件＋追加共有UI6件が成功。最終の共有UI・会員UI・Capsule関連58件も成功した。応答消失後の再確認、期待利用者、非表示／unmount後の遅い応答排除、30秒再認可、別datasetを含む。
- `npm run test:member`：実OIDC／一時PGの20件が成功。旧migrationを変更せず、追加migrationの再実行、所有者境界、版固定、token hash、同時発行・再発行・停止、削除・active停止・上限を確認した。
- 既存会員E2E10件が成功。新規共有E2Eは最終 `npm run test:member:e2e -- --grep 限定リンク` の390／1440px・2件が成功した。発行→匿名別context→独立Claim／Source→Explorer→private編集の非反映→次版の明示共有→旧リンク失効→共有停止を通した。両幅の画面を目視し、横溢れとpage errorなしを確認した。KG応答だけfixtureで、実Google／実KGの人間受入ではない。
- 初回E2Eでdevサーバーの殻は`no-cache, must-revalidate`（API本文は`no-store`）と判明。また、同一fragment URLへの移動は再読込にならないため、失効後は前面への復帰と明示reloadで確認するようテストを修正した。共有Readerの初回表示で「自分の説明」を「作成者の説明」へ訂正した。範囲を絞った再試行のため、一時PG runnerはPlaywrightの`--grep`等を引き渡せるようにした。時間上限・専用DB guard・cleanupは維持する。
- Lint、最終の型検査込みbuild、差分検査が成功。本番起動のsmokeで `/shared` の200・no-store／noindex／no-referrer、無設定共有APIの503・no-store、既存Explorer／memberの200を確認した。一時PG・OIDC・Next dev・本番smokeサーバーは終了。実credential・外部送信・公開・課金・push／mergeは行っていない。

2026-10-10追加：所有者は共有済みsnapshotの一覧から旧版の説明・Graph・コメントを再閲覧できる。リンク停止後も本人認可で取得し、他の利用者へ旧版の権限を広げない。[旧版の再閲覧契約](CAPSULE_DISCUSSION.md#所有者が共有済みの版へ戻る2026-10-10追加)を参照。

## 所有者が共有時と現在の構成を比較する（2026-10-10追加）

参照追加の初回は完了した。Graphからの複数追加・プロフィール設定と比較し、保存後の発見が共有時からどう変わったかを本人が確認する体験を選んだ。共有済み版の再閲覧から比較を明示して開き、題名・説明・構成差分→対象／独立Claimの現在の根拠→現在版の閲覧・編集へ戻れる。

- 初回は本人が閲覧中の共有snapshotと、その操作で取得した同Capsuleの現在版の比較。任意の旧版同士・共有していない編集履歴・版の復元・Graph上の差分描画は対象外。現在版の変化を追跡し続ける画面ではなく、比較する二版の番号を表示し、再取得ボタンで更新する。
- 題名・説明は変更したfieldの前後全文をplain textで表示する。空説明・改行を保持する。Entity／Claim参照はdataset・種類・内部UUIDを基準に追加／除外／共通件数を分ける。順序・時刻・版番号だけの変更は内容差分としない。同じSPOの異なる独立Claimを統合せず、孤立対象も構成要素として数える。
- KGの名称・主張・出典は現在のデータであり、過去の知識本文や意味の訂正を復元しない。除外はCapsuleから参照を外した意味で、KGからの削除／否定ではない。共通参照のKG更新は検出しない。対象の共存・比較から関係・Claim・Global受入を生成しない。
- 現在版は既存GETでDB session・owner・dataset・期待Userを確認する。一覧cacheを比較の現在版に使わず、schema・ID・dataset・版の前後関係を照合する。取得失敗は「変更なし」にせず再試行可能にする。401は親のprivate内容も閉じる。匿名共有画面にはprivate現在版や比較入口を出さない。
- 比較内容はタブメモリのみ。閉鎖・タブ非表示・本人再確認・版切替・unmountで破棄し、要求をabortして遅い応答を表示しない。reload後は比較を閉じた状態へ戻る。既存の本人・共有snapshot再認可と編集草稿保持は維持する。
- 構成差分を先に表示し、変更したClaimと名称表示に必要なEntityを既存resolverで再解決する。各側の明示Entity構成で端点を検査し、比較用の和集合Graphは作らない。同時最大4要求、各要求15秒、名称取得全体60秒。失効／不正応答／タイムアウトでもID・追加除外を残し、現在の内容・根拠へ別タブで進める。リンクへprivate説明やCapsule識別子を付加しない。
- API／schema／migration／共有snapshot／token／コメントの参照版／KG・凍結dataset・保存形式は変更しない。比較だけで共有・再発行・更新・投稿をしない。コンポーネントを外せば従来UIへ戻せる。実Google・実KGの人間受入、外部公開は別判断。

### 版比較の検証結果

- 通常単体521件成功。最終の比較19件も単独で成功。明示参照の集合差分、同SPOの別Claim、孤立対象、各版30対象、端点検査、取得失敗、60秒上限、遅着排除、別Userへの非表示、再認可を確認した。
- 実OIDC／一時PostgreSQLの新規E2Eは390／1440pxの2件成功。共有版選択→題名・説明・構成比較→外したClaimの別タブ閲覧とSource→reload→共有停止後の比較→現在版の閲覧へ復帰を通した。共有snapshot・現在版・リンク状態の非変更も確認した。両幅の画面を目視し、横溢れ・page errorなし。
- 初期の並行実行では単体2件の5秒上限と冷間preflightの120秒上限に達したため、重い検査を直列化して再実行した。新規E2Eは画面確認後の全体120秒にも達し、この2件だけ既存の旧版閲覧と同じ180秒へ変更した。別タブの取得待ちはload完了・前面化を明示し、assertion15秒・製品通信上限・runner全体上限は維持した。初回の改行locatorとテスト型も補正。失敗証跡はローカルtest-results/comparison-first-*へ保持した。
- 全体lint、型検査込み本番build、差分検査が成功。検証サーバー・一時DBを終了し、使用portの解放を確認した。KG応答はfixture。実Google／実KGとの組合せ、全会員E2E・人間受入・外部公開は今回の検証外。
