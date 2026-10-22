# AI育成ラボ：0回からの初段公開

2026-10-22。[Issue #36](https://github.com/isinxnisi/graph-knowledge/issues/36)と運営者の明示方針を適用する。main `214b5c4ab4e4ac4b55f5a8fd1ac98c034bd1ea60` を基準にした `codex/issue36-ai-lab-publication` の統合候補。main取り込み・3200/beta更新・VPS配置は別々の判断を待ち、今回実施しない。

## 公開する状態

探索者見習いAIは、実推論0回・ラボ追加学習0回・未出動から観察できる。実推論成功、追加学習成功、GPU問題解消、開発4課題の採点承認を初段公開の必須条件にしない。実出動・学習・本線での自律活動は公開後の別工程。

既存の非AI比較5件と送信前保留2件を「準備と比較の記録」として保持する。非AI方針の差はモデルの成長ではなく、未承認の採点案を正解率として表示しない。実推論0・追加学習0は初段artifact契約から導く。実推論・学習記録を扱う時は別の契約版と検証を追加し、数字だけを書き換えない。

見習いの安定IDは `fe93a431-85cf-4fae-8b84-127e8bf866a7`。公式AIとは別個体。将来の公式AIIdentityへの表示binding `plunode-official-ai` は保持するが、実Identity IDはnullのまま。人間User、公式アカウント、参加許可や投稿者を新設しない。[コミュニティ基礎設計](COMMUNITY_FOUNDATION.md)の第2弾と整合させる。一般画面から架空の育成コメントを除き、実コメントがあるように見せない。

見習いの主表示だけを標準強度で自動浮遊させる。実活動の監視・探索中・学習中を示すものではない。固定PNGの顔と目は維持し、OS動き低減・画面外・非表示タブでは停止する。内部のstrong指定は可能だが一般向けの操作UIはない。正式アセット・アニメーション確定ではない。

## 本線の実装境界

`/ai-lab` と `/en/ai-lab` は通常のApp Router/React。隔離版の生成アプリ・API proxy・偽の認証をコピーしない。mainのSiteHeader、SiteFooter、Better Auth本人表示、言語・外観、GraphとClaim Readerを再利用する。コミュニティflagと認可、会員DB、KG、公開ゲート、収集Workerは変更しない。

`AI_LAB_ENABLED=1` かつ `GRAPH_DATASET=public-kg` の時だけ画面・ヘッダ入口・公開JSON GETを有効化する。既定は無効で404。mainへの取り込みだけで公開を有効化しない。新しい会員権限やmigrationは不要。ラボとAPIはnoindex、Hostを明示制限し、CSPは同originだけを許可する。広告originにアプリ画面を出さない既存guardも維持する。

既存Home/Graph/アカウントから入った同タブの公開URL・scroll位置だけを復帰用に保存する。Graphの既存checkpointとURL復元を使い、labへ出る時だけ同URL・同KG版に拘束したpanを補足する。Graph保存schema・取得・配置は変更しない。記録からGraph/Claimへ出る際は同じrun/filter/開閉・scroll位置へ戻る。同originの実装済み経路以外を復帰先にしない。本人情報・会員本文を保存しない。

## 公開artifact

固定lab SHA `af31afd5523655da45d2ceab87e0bca37cecd7dc` の検証済み公開出力から、専用schemaへ投影した `data/ai-lab/initial.json` を同梱する。元の実験環境・run/wire/raw・GPU診断・採点labels・サンプルコメントは配布しない。原記録と比較画面は既存lab branchに保全する。

許可fieldは全階層でstrict検査し、版・最大256,000 bytes・SHA-256・実行種別／選択／未学習・経路方向・参照ID・親runの整合性を検証する。リンクURLはJSONから受け取らずUUIDから構成する。Webが読むのはこの検査済みJSONだけで、PC/WSL/Kev/共有GPUや実験ディレクトリへ接続しない。公式AI・極小アイコンの新しい動作、常駐AI、チャット、AI書込・自動投稿・実状態監視は追加しない。

配備後は任意のread-only bindからcurrent pointerを読む。単回operator CLIはKG資格情報を使わず公開HTTPSのEntity/Claim/支持Citation/Source/Role/scopeを照合し、検査前後の公開revision不変も確認する。履歴と固定入力の書換えを拒否し、新版は追記する。検査済みの保存版へのrollbackは可能で、新版ファイルを削除しない。原子的pointer切替、期待する現版hash、排他ファイルで競合を拒否する。失敗時は現pointerを維持する。

閲覧中の外部artifact破損・不通は最後に読めた検査済み版へ戻し、冷起動時にそれがなければimage同梱版を読む。旧版の時刻とhashをそのまま表示し、新しい活動を捏造しない。閲覧は更新せず、更新後の反映はreloadで確認する。[更新・復旧手順](../runbooks/AI_LAB_ARTIFACT_DELIVERY.md)と[検証記録](../verification/AI_LAB_PUBLICATION_20261022.md)を参照する。

## 受入の3段階

1. **main取り込み**：候補の固定SHAと最新mainとの差分、共有UI・認証・Graph・既存テストと未確認事項を確認して、通常mergeを別途判断する。自動側未受入成果の無条件取り込みはしない。
2. **beta更新**：受入済みmainの固定SHAを3200へ配置する可否を別途判断する。ラボflag、日英導線、会員・コミュニティの有効化状態を確認する。未受入候補を3200へ直接配置しない。
3. **VPS本番反映**：通常時RAM/CPU/swap/disk・Web/Neo4j/会員PG・公開ゲートとの資源競合、Web image、artifact更新主体と最小権限、rollback、PC停止中の外部閲覧を確認する。実会員回帰と、可能な範囲のWebKit/iPhone確認結果・未確認事項を示し、運営者の明示確認を受ける。KG apply、再seed、Worker制御、Caddy/Access/SSH変更をWeb公開へ混ぜない。

既存隔離3268/graph-ailabと比較専用画面は元のlab版を維持する。統合候補は別のloopback3269で確認する。一般向け候補にデザイン／動作比較画面や開発4課題レビューの正式導線は追加しない。
