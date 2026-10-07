# Capsule・User Contribution・Global KGの将来構想

更新日: 2026-10-06 / 状態: ユーザー共有の将来構想を保存。未実装。物理schema・API・UI・投稿経路・審査方式の採用仕様ではない。

原文は[Capsuleについての共有](../prompt/20261006_Capsuleとか.md)。Capsuleは今回初めて正式共有された概念。本書をこの構想の正本とし、[PROJECT_CONTEXT](../PROJECT_CONTEXT.md)の目的、[プロダクト像](PRODUCT_VISION_AND_PRINCIPLES.md)、[関係モデルの基本設計](RELATION_MODEL_PRINCIPLES.md)と併読する。現行実装の契約は[ARCHITECTURE](../ARCHITECTURE.md)に従う。

## 1. 読み返す判断点

Global／localの境界、Entity・Claimの同一性、User Contribution、submission／審査／moderation、Saved View・探索途中の保存、公開共有、discussion、provenance、AI構造化、import／exportを設計・変更する時は本書を読む。閲覧画面から投稿へ繋ぐ導線を初めて設計する時も対象とする。

今回行うのは構想と判断点の記録まで。現在の探索にlocal識別子・権限・投稿stateを追加したり、将来用の抽象化を実装したりしない。

## 2. 概念と責務

| 概念 | 保存・提供したいもの | 同一視しないもの |
| --- | --- | --- |
| Global KG | サービスの知識受入経路を通したEntity・Claim・Source・Citation等。通常の関係探索の対象 | 全公開コンテンツ、真実の認定、ユーザー投稿全体 |
| Saved View | 既存KGの起点・確定条件・表現を再利用する見方 | 独立したlocal知識や仮説を持つコンテンツ |
| 保存ワークスペース | Saved Viewに加え、開閉・受理範囲・layout・pan/zoom等の探索途中を再開するもの | Capsule、当時の知識全体の完全再現 |
| Capsule | テーマ・事件・人物群・作品群・仮説等を一つの関係図／文脈として名付け、保存・共有するコンテンツ | 単なるSaved View、Global不採用情報だけの隔離場所 |
| User Contribution／submission | Entity・Claim・Sourceの提案、Capsuleからの一部昇格等を受け付ける行為・処理単位 | 受け付け直後のGlobal Claim |

原文のSaved Viewはlayoutや展開も含む広い保存体験の呼称。[既存の保存設計](EXPLORATION_PRESETS_REVIEW.md#会員の保存ビューと再現性)では条件中心のSaved Viewと探索途中の保存ワークスペースを分けている。この粒度差を維持し、いずれもCapsuleのlocalコンテンツとは区別する。UI上の名称は未決。

CapsuleはGlobal Entity／Global Claimへの参照と、Capsule内だけのlocal Entity、local assertion／relation、未確認情報、仮説、annotation、Source、discussion、初期表示状態・layout等を混在させ得る。全てを最初から必須にする仕様ではない。

local assertionはGlobalのPredicate／typed qualificationへまだ対応できない原語・自然言語の主張も保持する余地を残す。現在のClaim schemaへ無理に押し込む指示ではない。単なる配置線・注釈と主張の線を区別する必要も、Capsule表示の初回設計で確認する。

## 3. 混同しない境界

- **同じCapsule内にある ≠ 関係が主張されている。** AとBを文脈上同時に置くだけではGlobal Claimもlocal assertionも生成しない。
- **Globalから発見できる ≠ Globalへ内容を合流する。** 関連Community Capsuleへのリンクを表示できても、そのlocal Entity／assertionをGlobalの通常検索・neighbors・概要へ自動混入させない。
- **Capsule公開 ≠ Global受入。** URLを知る人への共有、公開検索での露出、閲覧権限、Global知識への受入は別の判断。
- **審査／moderation ≠ 真偽。** public Capsuleの表示可否とGlobalのSource確認・同定・意味正規化・Claim受入は別レイヤー。Global受入も真実の保証ではない。
- **localからの昇格 ≠ 破壊的migration。** 元の文脈・原主張・原資料・参照を失わせない。Capsule全体の公開や受入から各要素の受入を推論しない。
- **処理結果 ≠ Claim.polarity。** Global不採用・要修正・未確認はdenied Claimではない。否定命題そのものと、投稿の判定状態を分ける。

例えばCapsuleにGlobal人物A・B、local事件X、「AがXに関わったかもしれない」という原主張を置いて共有しても、通常のGlobal探索は変わらない。後に資料を確認して一部を受け入れるなら、Xの同定と主張の意味・根拠を別々に確認し、対応先を記録する。AとBの共存から人物間Claimを作らない。

## 4. Capsuleの性格と独立した状態

Global合流を目指す調査用、公開可能なCommunity／User用、Global合流を目指さないUserLocal／private用などがあり得る。三種の排他的enumや固定ライフサイクルはまだ採用しない。調査用だから非公開、CommunityだからGlobal不採用、とも決めない。

| 分ける軸 | 判断すること | 今は未決の部分 |
| --- | --- | --- |
| 作成目的 | 調査、共有、個人メモ、仮説等 | 分類、切替、複数目的の扱い |
| 閲覧・露出 | private、URL共有、公開発見等 | 正式な公開区分、認可、共有URL |
| public moderation | 公開内容・議論の扱い | policy、通報、非表示・訂正の手順 |
| submission処理 | Pending、要確認、review、結果等 | 名前、遷移、処理単位、再試行 |
| Global受入 | Entity／Claim／Source等の要素ごとの受入 | 審査基準、承認者、部分受入・改訂 |

悪意ある捏造、重大な人物情報、プライバシー性の高い内容を扱い得るため、自由な作成・共有と無審査の公開を同義にしない。ただし今回具体的なmoderation policyを確定しない。Globalへの不採用がCapsule-localでの保持許可を保証するわけでもない。

## 5. Identity・参照・provenance

Global参照とlocalの同定は区別する。同名・同じQID候補・近い内容だけでlocal対象をGlobal対象へ自動統合しない。将来は参照の所属範囲を識別できる必要があるが、ID書式、namespace、DB制約、所有単位は今決めない。

昇格時にはlocal要素と既存／新規Global要素との対応、受入範囲、確認理由、元の版を追えることを重視する。コピー・参照への差替え・明示リンクのどれを使うかは未決。元IDの一括書換えや元要素の削除を昇格の前提にしない。同一性の確認とClaimの受入は別であり、Entityだけ同定できても主張は未受入のままあり得る。

今後保持を検討する由来は、system／userの登録元、投稿者、取得元と取得時点、元主張・表記・言語、変換処理と版、確認／review履歴、Global受入の対応、Capsule-localの所属等。登録者と、Claim.subjectの人物も別である。

[基本設計](RELATION_MODEL_PRINCIPLES.md)の区別を維持する。

- provenanceは登録・取得・変換・受入の経緯。Sourceは主張の根拠資料、Citationはその箇所と支持・反証・背景等の参照。
- 投稿者名、Capsule名、AI結果、Source URLの存在を、それだけで根拠の支持やreview済みの証明にしない。
- CapsuleのSourceもGlobal参照かlocal資料かを区別する余地を残す。共有・重複排除・昇格の保存方式は未決。
- system登録／user登録、Global Claim／local assertionは内部・UIで区別可能にする。由来の種別から自動信用点数を作らない。

discussionはCapsule、local assertion、Global Claim等のどこを対象にしているかを区別する必要がある。現行DisplayRelation IDを無条件に永続議論対象へ採用しない。対象版・訂正／統合時の参照・公開範囲はdiscussion導入時に決める。

## 6. User ContributionとAIの候補

一般向けは、利用者が自然言語で主張とSource URL等を提示し、AIが厳密なKG表現との間を翻訳する案。主張したい内容自体を全面的にAIへ委ねない。専門家向けにPredicate・qualification・Source locator等を直接扱うAdvanced入力の余地も残す。

AIの出力候補はEntity、Predicate、qualification／Role、scope／period、原資料表記、既存語彙への対応可否、既存Claimとの近似。原入力・原語・言語・限定を保持し、候補を自然言語としてユーザーが確認できるようにする。近似一致はClaim同一性や自動統合の根拠ではない。

「既存意味IDへ寄せない」「未正規化の原語を保持」「human reviewへ回す」も有効な結果とする。型検証・語彙一致・AIの推定は、Source支持・Entity同定・意味受入を代用しない。

非同期Contribution UXの候補:

```text
submission → Pending／queue → 低コストvalidation・local処理
           → 必要なものだけ用途別のAI処理 → 必要ならhuman review
           → 結果保存 → ユーザーへ通知
```

全投稿に高価な同期AI処理を要求せず、画面上で完了を待たせない。URLだけの捏造・誤読を即Global公開せず、意味正規化が難しいものをreviewへ回す。2026-10-08共有の[AI処理方針](AI_PROCESSING_DIRECTION.md)では、限定的な判定はまずKevで検証し、広い文脈理解の外部LLMとは用途を分ける。同じ処理を無料APIへ振り分けるフォールバックを既定にせず、具体的な採否・実行方式は実検証後に決める。Job Queue等の先行実装を指示するものではない。

Global受入、ユーザー確認待ち、review中、修正依頼、Global不採用、Capsule-local保持可能等が結果候補。正式な状態名・判定基準・遷移ではない。「処理中の投稿」「要確認」「審査結果」「完了通知」の導線を初回Contribution UI設計で検討する。

**全投稿をCapsule経由にするかは未決。** Entity単体、Claim単体、Source登録、Capsule内の一部昇格、Capsule全体の調査を、別submissionとして持つ案も比較する。UI/UX、審査、AI処理、運用コストを見て判断し、今は共通の投稿単位を固定しない。

## 7. 宣言的manifestは責務検討の候補

`capsule.yml`等の、人間にも読める宣言的manifestでimport／exportする案を残す。一般UI、AI候補生成、Advanced直接記述、Git管理、diff／reviewが共通インターフェースへ収束できる可能性がある。

```text
ユーザーの自然言語主張＋Source
    → AI構造化候補 → 宣言内容のvalidation → ユーザー確認／review
    → 認可された取込 → 対象範囲に応じた保存
```

AIやimportファイルから直接Global DBへ書く契約にしない。validation成功はGlobal受入ではない。ユーザー宣言から「review済み」「Global受入済み」等のserver判定を自己付与できない境界が必要になる。

内容の宣言、serverのqueue／review／moderation／AI判定、presentation／view stateを責務として分ける。一つのファイルの別sectionにするか別artifactにするかも未決。manifest名、YAML採用、schema、版、Global contributionとの共用を確定しない。宣言形式で自然に表せるかを、Capsuleの責務を検証する材料にする。

## 8. 現行コード・docsとの照合

照合基準: Phase 20のcommit `93f3638`。以下は既存実装の性質と将来適用時の衝突点であり、今回の変更指示ではない。

| 現状・参照箇所 | 衝突し得る前提と再設計する時点 |
| --- | --- |
| `lib/domain/fixture.ts`・`api.ts`：UUID参照、管理Predicate、固定typed限定のEntity／Claim。local・投稿者・受入状態のfieldはない | 現dataset内のKG専用型は適切。これを全Capsuleコンテンツの唯一の型へ拡張すると、未正規化主張・仮説が落ちる。local表示／投稿入力の初回設計で所属・参照・型境界を決める |
| `lib/server/queries.ts`：neighbors／Claim／overviewは`visibility=published`を読む。Global受入状態を検証する意味はない | 現在のpublishedを将来のpublic CapsuleやGlobal acceptanceへ流用すると混入する。公開共有／投稿の初回設計で読取対象と認可を分ける。検索／Entity詳細も現在はEntityの公開区分を持たない |
| `lib/client/graph-state.ts:projectGraph`：rootと受理Claimの端点から表示Nodeを導出 | 関係を持たないlocal Nodeを文脈として任意配置するCapsule表示には、そのままでは不足。Capsule構成要素の所属をClaimから導出しない。現在のGlobal探索は変更不要 |
| `lib/client/graph-presentation.ts:displayRelations`：表示中ClaimをSPOへ束ねる | 現GraphのEdgeは取得Claim由来だが、全表示線がGlobal Claimであるという製品全体の規則ではない。local assertion／注釈線を同じrendererへ渡す時は出自・意味を見分け、Claim UUIDへ戻れる既存境界を保つ |
| `lib/client/exploration-snapshot.ts`：受理Graph・選択・viewを画面内で一件保持 | Saved View／永続ワークスペース／Capsule manifestのschemaではない。保存・共有時は通信、cursor、権限、参照版、再解決を設計し直す |
| `lib/domain/dataset.ts`・`lib/server/seed.ts`：専用環境・混在拒否・固定fixture一致の再seed | 科学／漫画等の検証分離でありCapsule／Globalの製品境界ではない。昇格・更新処理の代用にしない。凍結dataset・guardを緩める必要もない |
| `datasets/pilot-event/v1/ledger.json`等の台帳：資料・意味・人間受入を保持 | 将来provenanceの参考になるが、runtime APIに投稿者や処理状態の一式を提供する基盤ではない。台帳の記録をruntimeでも保持・参照する範囲は書込設計時に決める |
| `components/Explorer.tsx`・`app/page.tsx`：dataset別の閲覧・探索画面 | 現在は投稿導線がないが、閲覧専用を永久要件にした構造ではない。Contribution着手時には探索を失わず提案・結果確認へ往復する導線を設計する。今はボタンや空のrouteを追加しない |
| [ARCHITECTUREのDB責務](../ARCHITECTURE.md#postgresqlとneo4jの責務) | Neo4j＝知識の正本、PostgreSQL＝運営という現方針はGlobal KGに適合。Capsule-localの正本をどこに置くかは未決で、この表から自動決定しない。Global知識を両DBで二重管理しない方針も維持 |
| [保存ビュー設計](EXPLORATION_PRESETS_REVIEW.md)・[プロダクト像](PRODUCT_VISION_AND_PRINCIPLES.md) | 保存は既存知識の参照／条件とする判断をCapsule内容へ適用すると衝突。従来設計はSaved Viewの範囲で有効。新しいコンテンツ保存の正本・版・権限は別途設計する |

**現行runtimeを今変更しなければならない衝突はない。** ただしKG読取用の型、published、SPO束、到達性、画面内snapshotを、そのままCapsule・投稿・全公開コンテンツへ一般化すると上記の境界が失われる。「現datasetのEntityはKG対象」であることから「全Graph EntityはGlobal受入済み」を導かない。demoは架空検証データであり、現在のdatasetはGlobalの運用受入制度そのものではない。

## 9. 未決事項と具体設計のタイミング

| 最初に着手する機能 | そこで具体化する判断 |
| --- | --- |
| Saved View／永続探索保存 | 条件中心の保存と途中復元、現在知識への再解決、権限・削除・版、Capsuleへの明示的な移行／参照。保存機能からlocalコンテンツを暗黙生成しない |
| 最小Capsule作成・local編集 | 代表的な文脈一件でglobal参照とlocal Node／assertion、未正規化情報、作成・閲覧の往復を検証。その後に正本DB・ID・版・最小manifestを決める |
| User Contributionの初回縦経路 | 単体投稿かCapsule経由か、自然言語確認とAdvanced入力、Source・locator、非同期状態と結果通知、再試行・冪等性・受入対応。UI/UXとserver flowを同じフェーズで設計する |
| public sharing／discussion | URL共有と公開露出、閲覧者の認可、local／Global表示、public moderation、対象版・訂正・削除。共有を提供する前にGlobal受入との独立を確認する |
| Globalへの昇格／import更新 | 対応付け・部分受入・資料の支持・意味正規化・Entity同定、元のlocal内容の保存、履歴、失敗・再試行、参照更新。破壊的migrationへしない |
| AI構造化／manifest import-export | 未対応語の保持、確認すべき自然言語、機械validationと意味review、宣言／server判定／viewの分離、認可・版互換 |

これらは着手順の承認ではない。Capsuleを作る前に投稿全体を完成させる／全投稿をCapsuleにする、といった依存を固定しない。将来のUIに必要な入口・処理中・要確認・結果・通知の往復は、実装直前にbackendだけ決めた後で足すのではなく、関連する最小縦経路の初回設計で具体化する。

投稿制限、ポイント、信用、reviewer制度、料金、共有区分、詳細moderation policy、AIサービス、manifest形式・schema、Capsule-localのDB、版参照・履歴の具体方式は未決。今回はこれらの先行設計・実装を行わない。

## 10. 今回の確認範囲

現行コード・docsとの照合、文書内の境界・未決事項・上位導線、ローカルリンクと差分を確認した。runtime・テスト・設定・dataset・過去archive／研究を含む335ファイルは変更前とbyte一致。文書のみの変更であり、DB投入・ブラウザ確認・アプリテストの再実行は行っていない。入力原文を編集せず保存した。
