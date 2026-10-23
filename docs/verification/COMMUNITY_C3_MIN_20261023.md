# コミュニティC3-min：隔離検証

2026-10-23。C1b `c1e0a46` からの変更。初回公開はC1a／C1b／C3-minと公開前確認。C2は独立した後続、AIは第2弾。[実装契約](../design/COMMUNITY_SAFETY_MIN.md)。本番公開の完了記録ではない。

## 実装と境界

- 投稿・スレッド・コミュニティへの通報、自分の受付状況、管理者の投稿非表示・解除・認可付き監査一覧。
- 運営CLIによる通報対象だけの確認、投稿非表示、コミュニティ停止・アーカイブ復帰。理由・担当者・case・期待版を必須とし、通常の会員adminと運営権限を分離。
- 管理者非表示とサイト非表示を独立保持。本人撤回を解除せず、停止解除で招待・旧権限を復活させない。
- 原子的な会員別濫用制限、失効・世代・現audience・通報期限・内容hashの再検査。007は隔離DBだけに適用。
- コミュニティCapsuleは「準備中」で無効。個人Capsule、Graph保存形式、限定共有tokenは変更しない。

## 検証結果

| 検証 | 結果 |
| --- | --- |
| 実Better Authセッション＋隔離PostgreSQL、C3 API | 14件成功。最終再確認15.61秒 |
| C1a／C1b API回帰 | 25件成功 |
| 既存会員・Capsule（従来000〜004 schema） | 33件成功 |
| Chromium UI | 6件成功、2.7分。C3の日英×390／1440幅4件、既存C1日本語PC、C1b英語スマホ幅 |
| 静的確認 | ESLint・型検査成功。公開用buildも別途確認 |

APIは別User・Origin・限定audience拒否、二重通報、期限切れ、取消／除外／再参加／停止後の確認拒否、古いcaseによる別停止解除の拒否、投稿待機と停止の競合、非表示と撤回の競合、管理者降格、認可後LIMIT、cursor失効、複数コミュニティ間の上限競合、退会時の理由削除を含む。

UIは通報入力→受付一覧→戻る→非表示→解除→監査を実APIで確認。Capsule非活性、横はみ出し、未処理ページ例外も検査した。既存C1試験中に一時的な「Member database unavailable」ログが1件出たが、試験は成功。独立した最終C3 API試験も成功した。実Google OAuth・iPhone実機・長時間の実運用負荷は未検証。

### 実画面

- [日本語390px・通報](assets/community-c3-min/report-form-ja-390.png)
- [日本語390px・管理操作記録](assets/community-c3-min/moderation-log-ja-390.png)
- [英語1440px・通報](assets/community-c3-min/report-form-en-1440.png)
- [英語1440px・管理操作記録](assets/community-c3-min/moderation-log-en-1440.png)

これらは隔離DB＋fixture認証での実機能画面。3275／graph-comの架空データ試作とは異なる。

## 再確認方法

```sh
node --import tsx scripts/test-member.ts --community --safety
node --import tsx scripts/test-member.ts --community
node --import tsx scripts/test-member.ts
node --import tsx scripts/test-member.ts --community --e2e --grep 'community C3'
```

専用テストDB・fixture認証サーバーを使う既存harnessで実行する。既存会員DBや本番originへ向けない。運営操作の手順・dry-run・明示確認は実装契約を参照。

## 確認環境

公開用build `8HYCrb3j_1NueQ8xs10At` 成功（compile 46秒、型検査57秒）。3200／betaへ `COMMUNITY_ENABLED=0` で反映し、両方でPLUTO Graph描画・コミュニティ画面/APIの404を確認。PC／390pxの既存トップも表示確認した。更新前buildはローカル `backups/community-c3-prebuild-20261023` に退避。

3200、beta、3275、graph-comはいずれもHTTP 200。dataset revisionはすべて `82b01515-594c-48ca-b4b6-515eefac83ca` のまま。3275の許可外Hostは404。3275／graph-comは今回更新しておらず、実コミュニティを有効化していない。実機能の確認先は上記隔離テストと保存した画面記録であり、betaやgraph-comではない。

## 公開前の残作業

実Googleログイン・iPhone実機、005〜007の本番移行計画とバックアップ／復旧手順の承認・検証、通報窓口と担当者・応答運用、個人情報を含む理由／監査の保存期間と削除運用の確定が必要。7日は内容確認の有効期限であり、DBレコードの自動削除期限ではない。保存期間の自動削除jobは未実装。サイト運営はCLIで、Web管理コンソールは未実装。

C2掲載・ギャラリー・Graph接続、AI・高度分析は後続。今回、本番・既存会員DB・公開KG・Worker・Kevへの変更はない。
