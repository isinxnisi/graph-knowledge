# 外部パッケージの共通取込契約

2026-11-05。R1dで専用BearerのHTTP受付・永続package／項目receipt・共通原資料確認／意味重複照合／受理・直接配送clientを実装。配置・実接続は[検証記録](../verification/KNOWLEDGE_IMPORT_R1D_20261105.md)、設定と送信は[runbook](../runbooks/KNOWLEDGE_IMPORT.md)を参照。**定期ChatGPT配送・Issue adapter・Web貼付は未実装**で、R1／R3の残件として維持する。将来構想だけを理由に実装範囲を増減せず、[再計画](PLUNODE_IMPLEMENTATION_REPLAN_20261105.md)の必須範囲を維持する。

## 担当と入口

ChatGPT側がテーマ・資料URL・情報を揃える。Plunodeが、許可範囲の検査、原本取得、引用・支持・適否の確認、同一性と重複照合、原記録・テーマへの反映、公開を担当する。外部側の「確認済み」「同一人物」等の自己申告を公開承認や同一性判断へ昇格しない。

第一候補は認証付きAPI。次のpathを実装先とする。汎用のKG操作APIや管理Connectorの資格は使わない。

| 操作 | 契約 |
| --- | --- |
| `POST /api/knowledge-import/packages` | immutableなpackageを受け付け、202とreceiptを返す。公開完了とは区別 |
| `GET /api/knowledge-import/packages/{receiptId}` | 同じ送信主体の受付・項目別結果・反映先・待ち理由・計測可能な利用量を読む |
| `POST /api/knowledge-import/packages/{receiptId}/cancel` | 未適用分を取消。適用済みの事実を削除・公開停止する操作にはしない |

同じpackageを、任意Web貼付、許可されたGitHub Issue等の配送adapterからも同じ受付serviceへ渡す。Web貼付だけの成功を自動配送の完了にしない。ChatGPTの予定実行から任意のHTTPへ送信できることは、利用可能な接続・資格で別途実証する。直接配送が成立しなければIssue等を実際に検証する。

## 送信資格と公開範囲

- 専用Bearer資格をprivate runtimeへ登録し、サーバー側で送信主体ID・namespace・有効期限／停止・許可した対象／テーマ・操作・受付量上限を決める。payloadやIssueのlabelで権限を追加できない。
- package側のnamespaceは資格のnamespaceと一致する場合だけ受け付ける。資格値はIssue・URL・ブラウザ保存領域・公開ログへ置かない。保存値はhashとし、比較は一定時間で行う。
- originと有効化設定は配置先ごとに引き継ぐ。β限定hostをコードへ固定して正式環境の移行を妨げず、βの資格やDBを本番へコピーしない。
- サービス送信主体と一般会員を分ける。外部packageからowner・運営者・公開投稿者を自己申告できない。運営収集を人間の投稿と偽装せず、一般会員の投稿／匿名帰属は既存の会員受付を使う。
- 本人確認、公開範囲、参照の停止と内容版は受付時・外部送信前・最終適用時に検査する。無効資格の未処理分も通常適用を止める。正常分に管理者の個別承認は要求しない。

## payloadとID

形式識別は`plunode-knowledge-package`、`schemaVersion: 1`。envelopeは`namespace`、送信元で安定した`packageId`、正の整数`revision`、共有の`entities`／`sources`、`items`を持つ。JSON 2MB・1package最大20項目を初期上限とし、大きなテーマは安定した項目IDを持つ複数packageへ分ける。上限を全データ巡回の対象件数制限へ読み替えない。

| 内容 | 取り扱い |
| --- | --- |
| 新しいEntity／Source | package内のlocal keyで参照する。正本IDはサーバーがnamespaceと安定keyから割り当て、既存IDの上書きに使わせない |
| 既存Entity／Record／Source／Theme | 正本IDと観測した内容版を明示。元contentを外部側から正本として渡さず、現在の公開内容をサーバーが取得する |
| 原語 | 本文・関係語・範囲、名称、資料の原題／本文、引用／記載箇所を分ける。BCP47と指定の由来を保持。UI言語から補完しない |
| 根拠 | Source参照、locator、原文excerpt、支持／反対を持つ。URL・title・外部hashの自己申告だけで支持確認済みにしない |
| 時期 | 既存のID付き時期schemaを共用し、点／継続期間／発生候補幅と精度・不確かさを保持。暦以外をJSONだけの機能として完成扱いしない |
| テーマ | 許可した既存Themeへの追加参照と内容版を明示。テーマの選択と原Recordの意味を分離し、重なる時期だけで所属を推定しない |

項目の操作は次を共通の受理へ正規化する。任意のSQL、Cypher、foundation command、scriptを送る形式は作らない。

| 操作 | 必須となる対象 |
| --- | --- |
| Entityの追加 | 名称・分類と根拠。名前を確認した記録を同時に保持し、根拠だけを孤立させない |
| 関係の追加 | 2つのEntity参照と具体的な関係・本文・根拠 |
| 出来事／背景の追加 | Entity、固定Record版、またはThemeへの明示参照。初回のTheme情報はThemeへの追加と同時に公開 |
| 根拠の追加 | 対象Recordの観測版。本文・意味・原語を新投稿の文で置換せず、既存根拠を保持 |
| Recordの訂正 | 訂正元の観測版と訂正理由。言語指定だけ、引用だけの訂正も内容版へ保持。別の意味にする場合は関係の追加と区別 |
| Entity原文の訂正 | 対象の観測版、変更する名称／別名／説明等と根拠。別対象への付替えや訳文だけの変更と区別（R1eで一般投稿・取込の共通受理へ接続。[契約](KNOWLEDGE_ENTITY_CORRECTION.md)） |

訳文は原文の指定版・field・訳先言語を参照する別の履歴を共用する。原文訂正と訳文訂正を同じ操作へ潰さない。すべての新操作で共通の正規化を二重実装しない。

## 再送・部分不正・適用

受付の一意キーは`送信主体namespace + packageId + revision`。未知fieldを含めた受信payloadを正規化JSONでhash化し、原payload・hash・形式版・送信主体・配送元の版／hashを保持する。同じキー・同じhashは同じreceiptへ戻す。異なるhashは409とし、既存受付を変更しない。

新しいpackage版を出すだけで、旧項目の意味を黙って書き換えない。安定したitem keyと正本への対応を保持し、既存項目の変更は観測版付きの明示訂正にする。同じ事実を別item keyで送っても、実質重複の照合で既存Recordを再利用する。

header・資格・容量・形式版の不正は全体受付を拒否する。項目や共有resourceの不正は項目別に返し、そのresourceへ依存する項目を不備にする。独立して成立する他項目は進める。例外一件を全体停止や全件承認待ちへ変えない。

状態は受付／確認待ち／処理中／再試行待ち／補足が必要／反映済み／登録済み／取消を区別する。反映先には正本ID・内容版・Theme構成版を返し、現在版へのリンクと適用した固定版を取り違えない。部分成功は項目ごとの結果で表し、受付の202を「公開済み」にしない。

原本取得・外部確認をDB transactionの外で行い、固定hash・確認policy・対象版を持つdecisionを保存する。正本への最終適用で現在参照・同一性・重複を再検査し、正本操作journal・新版・Theme構成版・取得証明を知識DB transactionで確定する。別DBのreceipt確定前に停止した場合はactor＋item UUIDからjournalを回収する。取消と最終適用は受付／項目行lockで直列化し、先に適用した内容を取消表示へ変えない。配送ACKの喪失・同じ版の再送だけでは取得や推論を再実行しない。

## 共通の同一性と資料比較

現在の関連付けが有効なEntity組を、検索と重複照合の共通resolverで解決する。名前や訳語の一致だけでは関連付けない。比較用の代表IDを原Recordや固定Capsuleへ書き戻さず、再利用時も既存Recordの端点を保持する。解除・元Entity訂正・停止で現在の解決を無効化する。最終受理のtransaction中は同一性判断の変更と排他する。

資料は「同じURL」「同じ取得本文」「同じ支持箇所」を分ける。追跡parameterとfragmentを除いたURL比較はdocumentを選ぶparameterを保持する。取得先の安全性検証の代わりにURL比較keyを使わない。requested URLとredirect後URLを両方保持し、サーバーが確認した抽出方式と本文hashを比較する。方式が違うhashを同じ資料の証明にしない。Sourceの名称・引用・URL表記が変わっただけで独立した根拠として増やさず、元のSource pinと取得由来を保持する。

R1bで共通関数と利用者投稿の比較に接続した。R1cで[共通取得証明・対象台帳](KNOWLEDGE_ACQUISITION_INVENTORY.md)を追加し、会員受理と収集登録の証明保存・会員側の本文比較に接続した。旧receiptの再構成も行う。R1dで外部取込の受付・共通適用・証明保存と資料比較へ接続した。収集の意味重複判定への全面接続は未完了であり、全経路対応済みとはしない。

## 代替配送・予算・安全性

Issue等のadapterは許可したrepository・送信者の不変ID、Issue／コメントの版・更新時刻・hashを確認する。公開本文やlabelは権限にしない。資格はprivate adapter設定だけに保持し、同じenvelopeと受付serviceへ配送する。編集・取消・再送、PC停止からの再開をcheckpointで追う。

Plunode側の原本確認・整理・翻訳は既存Gemini無料projectの利用量予約・用途配分へ接続する。外部ChatGPT側の取得不能なtoken量を0と記録しない。外部側が宣言した利用量と、Plunodeが実測した利用量を区別する。課金有効化・有料fallback・別keyによる上限迂回は行わない。

外部URL・資料・引用・抽出結果は未信頼dataとして扱う。既存のHTTPS／公開IP／DNS固定／redirect再検査・容量／時間制限を共用する。資料中の指示で送信先・actor・利用上限・公開範囲・適用条件を変更できない。取得成功と遷移先の安全性・事実の支持を同一の保証として表示しない。

## この契約から残る実装

R1dのHTTP入口・永続受付を再実装しない。R1eのEntity原文訂正・固定版readerを維持し、翻訳文脈／cache等のR1残件を閉じ、R3で予定実行からの直接配送またはIssue等の代替配送を実証する。新Entityの別名／説明は現行の確認契約で保証できないため黙って捨てず項目不備とし、根拠付き情報で別登録する。時期schemaは既存と共用し、周期／定性の入力と描画はR4に残す。R2の全件巡回を人手の対象選択へ戻さず、双方で対象台帳・適用receipt・予算の共通部分を利用する。APIのpathを書いたことを、接続できた証拠にしない。

## R1dの実装上の境界

- APIの操作名はcreate-entity／create-relation／add-information／add-evidence／correct-record／translate-text。最後は原文target＋field＋観測版＋language＋expectedRevision＋textだけを送れる。内部の会員投稿型への変換で架空の関係や根拠を作成しない。
- JSON本体の型だけで公開しない。許可操作・対象／テーマ、依存resource、現在の公開範囲・内容版、原資料の引用、支持・意味重複を段階検査する。取消理由も受付へ保持する。
- request／token上限は既存の無料project台帳を共用し、用途collection-checkへ配分する。取得不能な消費はnull、未送信だけ0。503・429・結果不明は間隔を空け、1項目1利用日8送信／8取得準備を超えない。管理者による通常の個別承認へ戻さない。
- Entity／Sourceのlocal keyはnamespace内で安定させる。変更資料は新しいlocal keyにするか既存Sourceの観測版を使い、既存IDの上書きには使わない。Record keyはpackage内で安定させる。前版が処理中なら新版は409で待機し、無関係な別packageは進められる。
- 結果に返すrevisionは適用した固定版。currentUrlは現在の公開版への導線であり、固定版readerの完成を意味しない。停止された対象やテーマのリンクは返さない。

R1eのcorrect-entityは、aboutとentityCorrection.targetに同じ既存Entityの観測版を指定し、entityCorrection.contentに訂正後の全内容、reasonに理由を含める。Recordは同じ対象に結び付く定型の訂正記録と根拠で、変更する原文そのものは構造化されたbefore/afterで確認する。ID付替えや分類変更は不可。[詳細](KNOWLEDGE_ENTITY_CORRECTION.md)。
