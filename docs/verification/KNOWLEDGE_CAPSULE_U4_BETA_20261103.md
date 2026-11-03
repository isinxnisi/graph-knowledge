# U4中間：時期フォーム・任意年表・実会員のβ接続

後続の現在状態は[訂正取込・配置・Tunnel復旧](KNOWLEDGE_CAPSULE_U4_UPDATES_20261103.md)を優先する。以下は時期フォームと初回β接続時点の記録。

2026-11-03。U4全体の完了ではない。前段は[断面保存・編集連動](KNOWLEDGE_CAPSULE_U4_SAVE_20261103.md)、今回の契約は[U4](../design/KNOWLEDGE_CAPSULE_U4.md)、再開は[β runbook](../runbooks/KNOWLEDGE_BETA.md)。

## 確認先と操作

- 日常確認先：`https://graph-beta.isinxnisi.com/`。紹介／新着テーマ、検索の「テーマから」で年表・関係図を区別して開く。通常Graphの中央領域と同じ場所で読む。
- Webbの年表：`https://graph-beta.isinxnisi.com/?ktheme=u3%3Afbaa9ee12f288cfa%3Atheme&krev=1&kview=split`。
- テーマ見出しのCapsuleから作成→アカウントへ保存→My Capsulesから再訪。確認用に **U4確認｜Webbの年表と時期** を1件、本人のβアカウントへ保存して内容版2まで更新した。公開・共有していない。
- 関係図の内容一覧から関係を選択→選択メニューの編集→「年表に表示する時期」。時期・意味を変更し適用→Capsule保存。元テーマ・原記録の時期は変更しない。
- 通常のPLUTO GraphからCapsuleを作り、calendar操作で任意に年表を追加する。時期を指定するまでは日付を補わず、時期なし情報として残る。関係フォームからの時期追加でも年表を有効にする。

## 完成した部分

関係の任意timesは、未指定で取得版を継承、空配列で明示解除。年／月／日、時点、続いた期間、発生時期の幅、未区別の範囲、開始・終了の不確かな幅を入力できる。複数注釈は保持する。周期・定性は失わず、新規フォーム入力は暦を対象にした。図の移動で時期・順序を変えない。取得版baselineと作者の表示・時期を分離し、Undo・破棄・明示保存を既存履歴で扱う。

通常KGの空の編集ラベルを「関係する」へ潰さず、既存の具体的な役割表示（著者・プロデュース・監修等）を年表情報でも利用する。肯否を保持する。元の型付きClaim・引用・限定はoriginの取得版に残り、元KGに書き込まない。時期なしでは、次の操作が分かる空状態を出す。

公開読取を3276のoperator guardから分離した。βは専用PG55476／Neo4j7699、既存会員は55433、通常KGは7697のまま。β WebのPGはdefault_transaction_read_onlyを有効にし、明示適用済みmigrationのchecksumを確認する。service内部の自動DDLも呼ばない。初回β確認でこの内部初期化が残っていたため503となり、読取専用のprepare処理を注入して修正した。ローカル専用API／ページはβで404、別Hostは403。

TOPの初期HTMLに紹介・新着テーマを含める。初期描画直後の同じ取得を省き、30秒後・TOP再訪・明示再試行で現在の公開可否を確認する。テーマだけ遅延表示する設計ではない。失敗時はデータの表示可否を未確認のまま保持せず、紹介テーマの見出し付き案内と1つの再試行操作へまとめる。同じ失敗を紹介／新着の2か所へ重複表示しない。

## βに入れたデータ・保全

3276の公開読取から、Webb展開・Webb国際協力・漫画をつくる人々の3テーマだけを選択した。20 Record、53 object／53 revision、選択Recordのlegacy link20件。ID・版と公開断面を保持し、仮想fixture・私有版・旧試作Capsule・共有・操作履歴は移していない。新しい複写操作の履歴を残した。

選択入力SHA256：`0e96d45ae97efd4cd1691aedb46df6e2a32acca622f1727596f16ddb32dffe56`。`knowledge-beta-seed.ts`の2回目はreplayed、追加なし。知識migration001／002を専用DBへ明示適用し、checksumは変更していない。初回publisherはNeo4j起動完了前に一度失敗したが、通常再送で同じstageから20記録の公開へ進み、pending=false／lastFailure=nullになった。

- 知識DB：custom dumpを別名DBへ復元し、13テーブルの全行fingerprint一致。dump SHA256 `6fdd9d171320c9c1fed357d6c7afd2131bc73b0ed4cabb5d344b0ec98afed3d4`。
- β会員DB：切替前にWebを止めてcustom dumpを採取、別名DBへ復元し34テーブルの全行一致。dump SHA256 `f8104a83011c984c0e5a233fe124925a29ad74dceaa0d796aaa4d87bc5240423`。会員migration追加なし。
- private資材は当該worktreeの `.local/u4-beta/`。backupは `knowledge-backup-058c3cdd0440` と `member-backup-98a184d45575`。復元用の一時DBは照合後に撤去し、live DBを上書きしていない。
- Google・origin・Cookie・運営・コミュニティ・既存AI artifactを稼働processのprivate環境から引き継いだ。DB container ID／StartedAtを保持。通常KG revisionは `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`。未追跡memo.txtを保持。自動候補の受入・一括ackは行っていない。

## 検証

- 関連UI・保存・runtime guard 101試験成功。既存ドメイン等57試験成功（実DBを要求する27試験はこの通常実行ではskip）。別に使い捨てPG＋OIDCによる会員Capsule27試験を実行し成功。新形式・時期の本人保存／他人404、旧共有・会話・掲載・停止・通報・容量を確認した。fixtureと実Googleを混同しない。
- TOP初期表示・失敗時の案内／再試行、読取専用初期化、専用ページguardの9試験成功。最終追加のKG役割・否定を含むCapsule断面13試験成功。既存Studio49・年表UI4も同じ変更確認で成功。
- ESLint、diff空白、型検査を含むproduction build成功。修正途中のテストには、不正なfixture polarityとテストdoubleの期待値・selectorの誤りがあり、正しい境界を確認して修正後に再実行した。これらを成功件数に二重計上しない。
- ローカル3200のTOPは200で初期HTMLに実テーマ3件、仮想例・エラー文なし。公開status／themes200、ローカル登録API／専用ページ404、別Host403、通常dataset200。知識公開activeは `k75-61bcd21a96c6686e73112b880579045b`、20記録。
- HTTPS βの既存実Googleセッションで、作成→本人アカウント保存→My Capsules再訪→時期の意味／補足を編集→内容版2として保存→再訪して保持を確認。OAuthの再ログイン・Google callbackを再実行した意味ではない。新形式の共有ボタンはdisabled。
- 3276の実Webbで不正日付を入力して修正できること、範囲の意味を変えると描画が変わることを確認。通常PLUTOのCapsuleへ任意年表を追加する経路もβで操作した。試験下書きは保存せず破棄した。
- Chromeの390×844で保存済み年表を再訪。modalは幅378px、横はみ出しなし。viewportを戻した。iPhone実機・実ソフトキーボードは未確認。

HTTPS βは作業中にCloudflare Error1033を断続的に返した。ローカルWebとは分けて確認し、既存Windows Cloudflaredの再起動を試みたがサービス権限不足だった。設定・Tunnel・WARPは変更していない。その後接続が復帰し、上記実会員操作を確認できた。再起動をまだ実行していなければ不要と利用者へ伝えた。接続の安定性を今回のアプリ修正で保証したとはしない。

## 配置・残り

アプリsource：`70f2b3bb3e3757237df394fc8d3dbf87d50de94e`。mainへ固定SHAで受入。3200／HTTPS β build：`gHfhvQjfGMqGvIkD-o0uH`。3276 build：`eM-TeckRvBCbVQCGKneqj`。実装branchは `codex/issue75-theme-foundation`。日本語commit・通常pushを行う。本番VPSは未変更、正式切替はU8。

U4は途中。原記録／テーマの訂正を比較して独自名・注記・配置・時期を保つ明示取込、新形式の同URL共有・旧版コメント・固定コミュニティ掲載・年表OGP、原記録停止の全公開面への現在認可が残る。一般投稿AI審査・収集Worker・予算はU5／U6。年表の直接作図は合意どおり初版外。

残りのCodex指示回数は **追加2回程度** の推定。訂正の差分取込と、共有／停止／OGP等の総合接続を一つずつ完了させる想定。βと実会員への接続は今回済んだため、同じ隔離実装を再作成する工程は不要。通常の判断ごとに確認待ちへ戻す意味ではない。

最終buildでも通常PLUTOのCapsuleへ時期（2003年・操作確認用）を追加し、年表の点になることと、著者／プロデュースなどの具体表示を確認した。この下書きは保存せず破棄。βの保存済み確認Capsule（内容版2）は最終buildからもう一度再訪した。証跡は開発PCの既存visualizationsディレクトリ内 `u4-beta-account-timeline-final.png`、`u4-beta-time-form.png`、`u4-beta-saved-mobile.png`、`u4-beta-optional-timeline.png`。
