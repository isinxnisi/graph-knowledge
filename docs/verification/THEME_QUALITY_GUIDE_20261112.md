# 共通テーマ品質ガイドの実装・β確認

依頼：2026-11-12の依頼文v2／品質ガイドv1.1。確認日は2026-11-13 JST。

## 保存と通常運用

稼働正本：βの既存会員PostgreSQL、site_editorial_guide_version、ID theme-authoring-quality。版・日時・変更理由・内部の運営者を保存する。本文のコード内fallbackやGit内コピーは作らず、添付は初回移行の資料としてだけ使う。既存site_operation_requestを再送受付に再利用し、本文は履歴表に一度だけ保存する。

get_theme_authoring_guideは固定技術契約に現在の品質本文を添える。read_theme_quality_guideは現在／過去の全文と履歴、update_theme_quality_guideは期待版・変更理由付き改訂と過去本文の新しい版への復元。通常の更新にbuild・再起動・配置・App更新・独立審査は不要。一般利用者や収集専用tokenを昇格せず、同じactive運営者とcompose scopeの境界を使う。

## 内部試験と配置

- 関連unit17件が成功。MCPの2操作とscope不足時の非dispatch、既存画像入力、署名・issuer・audience・expiryの検証を維持。
- 使い捨ての隔離PostgreSQLで統合3件が成功。空の初版、未認証相当／非運営者／無効アカウントの拒否、別service instance／別operatorの読戻し、同じ受付の再送、内容の変わった受付の拒否、2チャット競合、履歴保持、過去本文の新規版への復元、存在しない版の拒否とrollbackを確認した。
- migration041の適用・再実行と過去checksum不変を隔離DBで確認。最初の統合試験はfixtureに既存の運営機能フラグを入れ忘れたため拒否された。fixtureを修正し、認可を緩めず再実行した。
- 関連ESLintと型検査込みproduction build成功。build hvbi54GEXks7W_H8ajb1rを3200へ配置し、HTTPS βで同じWebを利用する。Webだけを再起動、Worker／Kev／Windows task／正式App／本番VPSは変更しない。
- β会員DBの整合backupを.local/theme-quality-guide-20261112/member-before.dumpへ保管して、明示migration041を適用。初回CLIは.env.public未読込でDB接続前に停止し、env-file指定で再実行した。本文の自動seedはなく、空状態を読んでから実ChatGPTで投入する。
- localhost3200／HTTPS βへ未認証でread_theme_quality_guideをPOSTし、両方401。公開画面へ品質本文や内部運営者の情報を追加していない。

## 実ChatGPTの確認

既存の同じβ Appを23→25操作へ更新。追加scopeや新Appは不要。本人が以前に許可したcompose接続を使用する。専用会話で添付v1.1を読み、get_theme_authoring_guide／read_theme_quality_guideのrevision0を確認してupdate_theme_quality_guideへ投入。別呼出しで本文と12節・末尾参照を読戻し、DB版1を確認した。保存日時は2026-11-13 00:12:15 JST。添付との差は最終改行1文字だけで、外側空白を除いた本文は一致した。

同じ実会話から、実装済みの通常手順を第12節へ反映する改訂を依頼した。最新本文を再取得→update_theme_quality_guide→read_theme_quality_guide→get_theme_authoring_guide→旧1版の指定読取がすべて成功。現在はDB版2／文書v1.2、更新日時2026-11-13 00:14:53 JST、requestId 62aa17d7-9275-46aa-9326-62e68152160a。品質の要点・1〜11節と末尾の根拠一覧は旧版と完全一致し、変更は冒頭の改訂記録と第12節だけ。初版と旧履歴は保持。

本文1→2版の間にbuild・再起動・配置・App更新を行わず、最初と同じbuild hvbi54GEXks7W_H8ajb1rから新版を取得した。本文の日常改訂は会話と既存APIだけで済む。新規の別チャット作成での確認だけは未実施。別のAPI呼出し／別service instance・別運営者での読戻しは確認済みであり、未確認範囲と区別する。本番・テーマ・商品・画像・予定・収集計画は今回操作していない。

画面：C:/Users/nishr/.codex/tmp/plunode-quality-guide-20261113/chat-update.jpg。

今回の①保存契約・②実装／内部検証・③実ChatGPTの初版投入と通常改訂は完了。本番反映は対象外。以後の通常改訂では、対象β Appで現在のガイドを読み、指定改訂を期待版付きで保存し、再取得する。Codexへの本文修正依頼は運用手順に含めない。
