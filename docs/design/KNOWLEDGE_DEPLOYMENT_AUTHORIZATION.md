# 知識サービスの配置別認可（R1j）

2026-11-06。R1の共通認可契約。通常の管理者承認を追加する変更ではない。正式VPSへの有効化・接続・移行はR6で行う。

## 判断

知識の公開読取、会員本人の草稿・確認依頼、運営者の例外操作、用途別Workerを分ける。環境名の文字列を各入口に埋め込む方式から、所有者だけが読める配置profileと既存の認証の組合せへ移す。これにより、正式環境で会員向けに開く準備をしつつ、βの許可会員・公開範囲を維持できる。

profileは機能を配置へ許可するものであり、本人のセッション・投稿の所有権・運営権限・Worker資格やleaseを代行しない。利用者・原資料・AI応答からprofile、接続先、権限、actor、利用上限を選ばせない。

## 信頼する設定

サーバー専用の `KNOWLEDGE_DEPLOYMENT_CONFIG` に絶対パスを指定する。JSONのschemaVersionは1。通常ファイル・実行UID所有・0600・32KB以下を要求する。symlink（親パスを含む）、存在しない指定、未知のfield、形式不正は503で停止し、βの互換設定へfallbackしない。秘密値はprofileへ複製せず、従来のprivate runtimeから引き継ぐ。HTTPやAIがprofileを書き換えるAPIは設けない。

| 項目 | 目的 |
| --- | --- |
| id / environment | 配置の識別。environmentはbeta / production。KNOWLEDGE_RUNTIMEと一致し、productionはGRAPH_DEPLOYMENT=productionを必要とする |
| origin / hosts | 正確なHTTPS originと許可Host。公開origin、会員機能を有効にした場合のMEMBER_ORIGINとも照合。forwarded-hostは許可を上書きしない |
| database | 知識用PostgreSQLのhost・port・DB名・接続ユーザー。資格情報入り接続文字列を環境側と照合。会員DBと同じDB、余分なURL query/hashを拒否 |
| neo4j | 知識投影の接続先を固定。資格情報は既存環境に残す |
| capabilities | 下表の許可機能。既存のenabled flagも必要。profileだけで無効な機能を起動しない |
| reviewMembers | allowlist＋UUID一覧、またはauthenticated。authenticatedは全ての**有効なログイン会員**の確認依頼に対応。未ログイン投稿や運営権限を許す意味ではない |

確認Workerのprivate review設定 `allowedUsers` はallowlistと同じ集合、authenticatedではnullを明記する。不一致は停止する。10人というβ実験時のschema上限は外した。β起動launcherは既存review設定の会員集合との一致を別に検査し、勝手にauthenticatedへ変えない。

profile未指定時は既存βのorigin／DB／指定会員と3276の隔離guardを互換経路として保つ。productionはenabled flagやNODE_ENV=testだけで開かない。正式公開のprofileは、R6で実物のCompose／DB／origin／資格を確認して作成し、このPCのβprofileをコピーしない。

## 操作の境界

| capability | 追加で必須の既存検査 |
| --- | --- |
| public-read | 公開世代・公開状態・履歴の公開範囲。managed WebのPG接続はread-only、既存migrationの検査だけでDDLを実行しない |
| submissions | 有効な会員セッション、本人ID、草稿の所有権、変更時Origin・期待版・再送ID |
| review / publish / translation | reviewMembersへの適合、固定受付版、本人の同意、原資料／対象・参照版／公開状態／意味一致の照合、共有AI予算 |
| operator | 現在の運営権限と有効なセッション、対象の現在版、許されたcommandのみ。通常の登録に必須操作を足さない |
| import | 専用principalのcredential・有効期限・許可用途・固定package、再送・内容hash・参照・原資料の検査 |
| collection / collection-reading | 操作する運営者の認可、有限job・取得資料・固定leaseと支持確認 |
| review-worker / publisher | 配置origin、前記の固定受付・公開条件。AIの承認だけで任意commandを実行しない |
| collector / reader | 私有clientのHTTPS originを同じprofileへ固定。サーバーは用途別tokenとjob leaseを検査。collector資格でreaderや運営操作を使えない |
| patrol（R2a） | 明示有効化・同じprivate配置profile／知識専用DB・各tickでの再認可。新旧の対象metadataの列挙と整理入力の保存のみ。本文取得・AI送信・原本変更・公開を許可するcapabilityではない |

公開readerのread-onlyは接続のtransaction設定で、正式VPSのDBユーザー別GRANTの最終確認を済ませた意味ではない。専用DB資格・ネットワーク制限・Linux対応を含むR6の現物確認を残す。

## 再開と権限取消

profileは処理境界で読み直す。確認送信直前・受理時・pendingの公開再開、翻訳生成の依頼者照合、各Workerの送受信でも検査する。削除や形式不正は自動fallbackせず、未処理のデータ・利用量・再送状態を保持する。送信済みのAI利用量を取消扱いで減算しない。会員の停止・退会、原資料／参照の停止、同意や受付版変更の既存検査も維持する。

既に共通DBでcommitした公開操作と私有会員データの削除の間の障害復旧は、従来の公開decision IDに従う。本人データを再作成せず、同じ受理を重複適用しない。

## 安全境界の確認表

| 攻撃・誤操作 | 検査・代表検証 |
| --- | --- |
| Hostやforwarded-host、環境flagで別配置へ接続 | deployment単体：Host／origin／DB／Neo4j／production flag、未知field・symlink・権限不正 |
| 限定会員の設定を全会員へすり替え | profileとreview scopeの一致、全会員nullの明示、別DBで送信・自動受理／取消のテスト |
| 過去のleaseで取消後に送信・公開 | 会員統合・翻訳生成・収集読解：active/所有者/同意/lease、profile取消の追加テスト |
| 別会員・非運営者・別Worker資格で操作 | OIDC＋PGの会員／収集／運営例外／取込統合テスト。実Googleはβの本人で代表操作 |
| AIや外部packageに権限／参照／更新先を指定させる | strict出力schema、固定package・wire・文脈hash、サーバー側のplan／参照再照合。参照統合／取込／翻訳の既存テストを継承 |
| 資料URLから内部接続・命令への昇格 | R1h資料リンクと既存取得器の公開IP・接続先固定・転送先再検査。今回のprofileは外部原資料の内容として読み込まない |

R2の巡回・R3の定期配送でも同じ共通契約を適用し、追加するAI wireの攻撃例は各工程で評価する。今回の配置分離だけで、未実装の自律整理・定期収集や全てのAIインジェクション対策を検証済みとはしない。

## 外部翻訳取込の共通契約への接続

横断回帰で、R1iの公開文脈付き意味一致確認が外部packageの翻訳だけに未接続と分かった。取込でも同じreaderで公開文脈・hash・参照版を固定し、送信資格の許可参照を超える文脈は送らない。送信前・応答適用・pending再開時に再照合し、保存したwire／digest／attemptと現行方針を公開decisionへ結ぶ。古い文脈なし結果を新方針として再利用しない。原文・原Recordの版は変更しない。

取込資格の `targets.sources` を省略した場合の既定は許可なしであり、翻訳の文脈に必要な資料も許可集合へ含める必要がある。既存のβ資格を自動で広げない。この設定は運営側の一度の配置で、一般会員に内部IDの設定を求めるものではない。AIモデルと予算は今回変更しない。
