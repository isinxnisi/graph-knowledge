# テーマの読み物の明示編集（β）

## 採用する構造

Theme.content に任意の `stories: {version:1, items:[{key, records:[{id,revision}], title?:{ja?,en?}}]}` を追加する。配列順が掲載順、records順が一つの読み物内の本文順。本文は参照Recordをそのまま読む。編集見出しは任意の言語別title、なければ既存の presentation.records.shortTitle／時期ラベル／原文の順。chapterQuestionとexplanationsは従来の意味と根拠参照を保つ。共通知識・年表配置・Graph構成とは独立し、kindによる選別は明示編集時に行わない。

未設定は旧版の互換表示（右欄はnon-relation、下部は日時なし）。`items:[]` は明示0件で自動一覧へ戻さない。旧版を一律更新しない。テーマ版のJSONへ保存し、DB schemaのmigrationは不要。過去版とCapsuleの固定断面を変更しない。

新規登録の `stories` と既存更新の `changes.stories` は同じschema。省略は保持、指定は掲載構成全体の置換。`item:KEY` は同じ受付の採用Record版へ解決する。指定が採用されなければ成功扱いで黙って部分掲載しない。掲載対象を外すだけなら removeRecordIds を使わない。

## 公開と版

新しい構成は正確なテーマ収録版に一致することを検査する。掲載中の版を変更／収録解除するときは、storiesも整合する形で明示更新する必要がある。無断の再選別・古い本文の新しい版への読み替えはしない。表示は認可済みsnapshotのみから解決し、一部の参照がないグループは全体を表示しない。公開停止は既存のテーマ全体の依存公開可否検査を維持する。旧版の内容を漏らすfallbackを作らない。

storiesのみの更新で、Git時代の編集導入が失われないよう readingBaseRevision の同一本文判定からstoriesを除外する。本文／事実／時間の変更と区別する。

## ChatGPTの編集経路

既存の get_theme_authoring_guide → read_theme → update_theme → get_theme_registration → read_theme。新しいtool、scope、管理画面は追加しない。read_theme.storyEditing がmode／selection／effectiveItems／全候補Recordの本文・見出し・chapterQuestion・解説参照・根拠を返す。出典URLは同じ応答のsnapshot.sourcesへ固定。編集者は共通品質ガイドを読み、読者に何を伝えるかを判断する。固定件数への削減やAI自動選別は実装しない。

requestId・対象テーマ版・運営認可・冪等性・競合処理・履歴は既存の受付を利用。運営経路はAI審査／送信0、一般投稿のAI審査は変更しない。操作受付とテーマ公開を混同しない。

## UIと実施範囲

既存アコーディオン、3件／全件の開閉、点と本文左端、全文と小さな出典・詳細リンクを維持。グループ内の各本文からそのRecordの正確な詳細へ入れる。Graph・年表・通常探索は変更しない。下部の「深く読む」も明示設定時は同じ構成を使う。βのみ。本番および実PLUTO／黒澤テーマの構成を編集しない。
