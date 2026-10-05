# Phase 15：第三のtyped限定の実装・検証状態

受入前（commit 64ad4b8）の記録。2026-10-06の受入後の完了結果は[Phase 15完了記録](README.md)を参照。

2026-10-05〜06。**実装を進め、実資料の人間受入・生成・seed・実データ観察は未完了。Phase 15完了とは扱わない。** [採用契約](../../design/EVENT_PARTICIPATION_CONTRACTS.md)と合わせて読む。

## 採用範囲と判断

PARTICIPATED_INは人物から特定開催回への参加という独立命題。参加を資料で確認した会議議長だけCHAIR限定にする。参加を伴わない名誉・委員会・シリーズ職には使わない。CHAIR_OF_EVENTなら非参加の職務も表せるが、E01の狭い参加者欄には不要。招待／写真／予定リストは参加を含意しない。INVITEDをenumへ入れずE02を生成対象から除外する。非参加をdeniedへ自動変換しない。

Eventは既存kindにoccurrenceと開催期間を追加。資料の特定開催回を同定し、期間だけで同一性を決めない。Claim.periodは本人の参加命題の期間で、Event期間・出版日・URL upload日と別。今回の実資料候補はClaim.period両端nullを維持。

nullはこのClaimの参加上の立場を限定しない。検索条件省略は絞らない別の責務。CHAIRしかenumにない現在でもCHAIR全選択を無条件に変換しない。denied CHAIRはその限定命題の否定で、広い参加・他立場・招待へ波及しない。

## 実装の境界

| 責務 | 三用途で共有／Event固有 |
| --- | --- |
| 型の適用predicate検査 | 固定三型の登録辞書とinvalidQualificationFieldsを共有 |
| payload・enum・原表記 | domain別strict schema、原語＋languageの小さいschemaだけ共有 |
| null／空集合／条件 | normalizeScopedValues／matchesScopedValueを再利用 |
| 取得 | 三条件を独立にLIMIT前適用する固定Cypher。自由query生成を導入しない |
| 比較 | 比較キーの端点・predicate・typed限定・期間精度/nullを共有。Event値の意味は独立 |
| cursor | v4でdataset・中心・predicate・三限定を拘束。既存の無Event条件cursorは維持 |
| 探索 | GraphStateの受理／表示検査、世代、開閉、休止復元、snapshot／復帰へ第三条件を伝える |
| 意味 | 制作Role／刊行物scope／組織制度語／会議議長の意味・Source受入は共通化しない |
| Event | 特定開催回同一性・開催期間はEntity固有。Claimへ期間を転記しない |

万能qualification、自由key/value、動的フォーム、汎用Cypher generator、共通Role enumは導入していない。第三型でも機械処理は再利用できるが、形式から意味・制度語の同義性を認定できない。

## 変更したAPI／入力

- schemaVersion=4。Entity.eventはeventだけ必須（occurrence／period）、他kindはnull。旧fixture入力1/2/3を保持し、Event kind／参加predicateにはv4を要求する。
- EntityDetailへnullable eventを追加。詳細と検索結果は開催期間を返す。Graph・概要のEntitySummaryは変更しない。
- ClaimSummary／詳細へnullable eventParticipation、Citationへnullable eventParticipationEvidence。
- neighborsへ任意eventRoles CSV。省略は無条件、空はPARTICIPATED_INだけ空集合、CHAIRは明示限定だけ。未知値／重複queryは400。predicate除外でも不正値を先に拒否する。
- 既存event kindを検索に公開。シリーズではなく現在のoccurrence契約を持つEntityだけ投入できる。検索kindは探索条件へ入れない。
- 専用Event datasetのcursorは、Event条件なしでもdatasetに拘束したv4。HTTP契約に新エンドポイントは増やさない。

## 語彙チェック

既存4 predicateとbaselineは不変。PARTICIPATED_INの追加比較票・意味契約・locale labelを既存vocabulary:checkで検証。比較票はユーザーのPhase 15指示に基づくCodexの技術・意味設計判断であり、Sourceの人間受入を偽装するものではない。

CHAIRの独立catalog／baselineをqualification:checkに加え、意味例の欠落、runtime label不一致、基準版との差、Git baseに登録された契約／基準版の書換えを拒否する。語義と原資料が適合するかは人間判断。招待の非参加という資料事実そのものをenum validatorが証明するわけではない。

## 実資料の受入状態

[datasets/pilot-event/v1/ledger.json](../../../datasets/pilot-event/v1/ledger.json)はpending。凍結研究台帳v2は変更していない。公式索引S11を再確認し、S12を再取得、旧研究と同じ本文SHA256を確認。PDF表紙の開催期間、印刷p.VIIの参加者欄、p.VIIIの招待／欠席を確認した。Codexの再確認を人間受入にしない。

| 対象 | 候補の狭い意味 | 状態 |
| --- | --- | --- |
| E01 Lorentz | 1927年第5回物理会議の明示参加＋当該会議議長。広い参加とCHAIRの2 Claimへ投影する候補 | 人間受入待ち |
| E03 Dirac | 同じ特定開催回の参加者として記載。Role限定なし、全日程／全sessionを認定しない | 人間受入待ち |
| 開催回 | 第5回／1927／Bruxelles、1927-10-24〜29。シリーズとは別の同一性 | 人間受入待ち |
| E02 Deslandres | 招待・欠席届の反例。参加やdenied参加へ変換しない | pending-not-for-runtime |

候補のSource／locator／原文意味・役職語／language／scope／禁止する推論／期間原表記／来歴を保持。新Lorentz／Eventの未確認QIDは作らず、Diracは既存人物IDを使用する。新datasetはscience v2から凍結内容をコピーした検証環境で、製品の分野Graph分断ではない。

人間受入がpendingならprepare／validate／seedが実資料生成前・DB接続前に停止する。検証用の模擬承認はtmpの台帳だけを使い、実台帳・実DBへ書かない。受入後の予定はEntity10／Claim13／Source11／Citation15／外部ID8（SUBJECT13、OBJECT13、HAS_CITATION15、CITES15、HAS_EXTERNAL_ID8）。現在の実資料投入件数は0。

## UIとブラウザでの観察

条件編集で「参加した」を選んだ時に「参加上の立場を調整」を出す。立場で絞らない／指定するを分け、既存draft取消・明示適用を継承。三限定すべてを開くとダイアログに縦スクロールが必要になる。段階提示を維持したため、初期画面へ常時表示する条件項目は増やしていない。

GraphのSPO束は変更せず、広い参加とCHAIRを1線へまとめて「参加した／会議議長」。限定が違う肯否混在は「肯定・否定あり」と点線で、矛盾認定をしない。Event Nodeはひし形と「出来事」の文字を使い、色だけで種別を区別しない。各Claimは詳細で個別の立場・期間・肯否・原語／言語・Citationへ戻れる。Entity詳細の「開催期間」とClaim詳細の「関係の期間」を区別する。

概要の集計構造を維持した。人工例では接続人物2名、DisplayRelation2本に対し公開Claim4件（肯定3／否定1）。CHAIRのCitation2件はClaim数を増やさない。同一Sourceを参照するCitation数もsourceCountへ二重計上しない。件数を人物・根拠・重要性へ変換しないが、統計中心の概要ではこれを直感的に読みにくい。これはpresentation上の残課題として記録し、意味モデルの失敗と混同しない。

人工ブラウザ経路：架空会議検索 → 人物2名 → 一線の参加束 → 個別の広い参加／CHAIR／否定CHAIR → 原語／Citation → 関係概要。CHAIR条件のdraft取消／適用 → 条件外広いClaimの詳細 → 同条件で人物を起点化 → 直前復帰 → 広く見る → 制作／組織へ → 復帰／開閉。limit=1の続き取得、通信途中のEvent条件変更、三限定同時条件を実APIで確認。

これらは**人工データ観察**であり、Lorentz／Diracの実資料探索の完了を意味しない。実データUIでは長い会議名・仏語Source・実scopeの読みやすさを人間受入後に確認する必要がある。

## Phase 16へ固定できる候補／留保

1. 独立命題はpredicate、同じ命題内の限定はdomain別strict型。ただし具体の意味レビューを必須にする。
2. 共通機構は適用先・型・null・条件・比較・世代・cursor等の機械処理に限定する。
3. 原資料語彙・language・scope・Source受入を正規化値から分離して残す。
4. Eventの開催期間等の対象自身の属性をClaim期間へ自動転記しない。
5. Claim UUID、命題比較キー、SPO表示束、概要集計単位を別責務にする。
6. 未指定限定と無条件検索、招待と参加、異なる限定の肯否を混同しない。

三型目で技術境界の再利用を確認した範囲は支持できる。実資料の受入・観察前にPhase 15完了や全領域への一般解と断定しない。家族の対称性・多項合併・対象aspect・自由qualifier等への適合は今回検証していない。正式な基本設計への昇格は、残る実資料検証を終えてPhase 16でこの限定された原則を確認してから判断する。

## 検証結果

2026-10-06。Node 24.21.0。人工検証と既存datasetの回帰を実行した。実資料Eventの投入・画面観察は未実施。

| コマンド／検証 | 結果 |
| --- | --- |
| `npm run vocabulary:check`（lint/testでも実行） | 5 predicate、4制作Role、0 error。既存ASSISTANT_OF/INFLUENCED_BYの同一端点組について人間比較を促す1 warning |
| `npm run qualification:check`（lint/testでも実行） | 3独立型、2組織立場、1Event立場、0 error/0 warning |
| `npm run test` | 9ファイル、195件成功。受入前生成拒否、E02混入／INVITED拒否、適用先／null、期間分離、三条件、cursor、意味基準版の同時書換え拒否を含む |
| `npm run event:integration` | 人工実DB＋HTTP 1件成功。実資料の1件は人間受入待ちでskip |
| `npm run test:integration` | demo実DB 22件成功。seed冪等性、既存API、DB停止時503を含む |
| `npm run science:v2:integration` | 科学v2実DB 1件成功 |
| `npm run pilot:v2:integration` | 漫画v2実DB 1件成功 |
| `npx playwright test --config=playwright.event-contract.config.ts` | 人工実DBのブラウザ3経路成功 |
| `GRAPH_TEST_REUSE=1 npm run test:e2e` | demo全28経路成功（最終単独実行） |
| `GRAPH_TEST_REUSE=1 npm run science:v2:e2e` | 科学v2全4経路成功 |
| `GRAPH_TEST_REUSE=1 npm run pilot:v2:e2e` | 漫画v2全8経路成功 |
| `npm run typecheck` / `npm run lint` / `npm run build` | すべて成功。新しいNext生成物directoryは既存と同様lint対象から除外 |
| `node --import tsx scripts/event-contract-test.ts seed` | 人工初回14 Node/16 Relationship、再seed 0/0。Entity5、Claim6、Source1、Citation2、外部ID0 |
| `node --import tsx scripts/prepare-event.ts --review` | 研究台帳検証成功、pending、3投影候補、E02除外、seedAllowed=false |
| `npm run event:prepare` / `npm run event:validate` | 期待どおり人間受入待ちで拒否。生成物を作成しない |
| `node --import tsx scripts/seed.ts --dataset=pilot-event-v1`（専用環境値） | 期待どおり人間受入待ちでDB接続前に拒否 |
| `npx playwright test --config=playwright.event.config.ts --list` | 受入後の実資料テスト3経路を列挙のみ。実行成功として数えない |
| 凍結入力照合／`git diff --check` | 作業開始f770225との36ファイル完全一致、既存4 predicate entry不変、diffチェック成功 |

人工＋既存datasetのintegrationは計25件成功／実資料1件skip、Playwrightは計43件成功。実資料Eventのseed冪等性を確認済みとは扱わない。画像・人工seed結果・凍結照合は[受入前検証記録](../../verification/phase-15/README.md)へ保存した。回帰テストが再生成したPhase 09/14の過去の画像は元の版へ戻し、履歴を書き換えていない。

初回は重い検証を同時に動かした際、人工APIで503、demoの開閉／空条件で2失敗が出た。人工APIをwarm状態で、demo全28件を単独で再実行して成功した。既存300msの入力判定が実行遅延の影響を受ける可能性は残るが、このPhaseで操作契約やタイミング値を変更していない。人工ブラウザの明示開閉検証では直前の選択をテキスト導線から行い、Nodeクリックの遅延トグルと別の操作を区別した。

## 残る完了条件

ユーザー指示「Codexの資料確認を人間受入へ置き換えない」に従い、E01/E03の狭い意味・会議議長限定・当該開催回同一性／開催期間の受入回答を待っている。資料確認だけでacceptedを付けていない。

受入後に台帳へユーザー判断を記録し、専用dataset生成／検証、DB7692へ2回seed、Web3215で実資料integration／Playwrightと画面観察を行う。長い会議名、仏語議事録、実scope、広い参加と限定の件数を実画面で評価してからPhase 15完了を判断する。受入範囲が調整された場合は投影候補も合わせて見直す。
