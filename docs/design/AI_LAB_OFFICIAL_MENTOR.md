# AI育成ラボ：公式AIの育成担当表示

2026-10-22。ユーザーのサイズ別表示方針を、既存 `codex/ai-lab-foundation` の隔離観察画面へ適用する。main・beta・VPS・コミュニティの本体実装は変更しない。

## 同じ個体のサイズ別表示

既存3枚の比較アセットを加工せず利用する。`OfficialAiAvatar` はプロフィール・通常・コメントの用途と対応サイズを受け取り、次の画像を選ぶ。目・球体・接続アンテナを維持し、アニメーションは付けない。

| 用途 | 対応する表示枠 | 画像 | 今回の配置 |
| --- | --- | --- | --- |
| profile | 128px | A：v02-translucent.png | 育成担当プロフィール |
| regular | 48 / 64 / 80 / 96px | B：v02-soft-flat.png | 育成コメント見出し48px |
| comment | 16 / 18 / 20 / 24px | C：v02-symbolic-flat.png | 各コメント横20px |

画像枠には元画像の余白も含む。今回の20px表示では、顔と接続アンテナを目視確認できたため専用簡略版は追加しない。16px専用の再造形やアニメーション方式は今回確定しない。比較画面は3方向を引き続き閲覧でき、説明をサイズ別採用後の状態へ更新する。

## AIIdentityの参照境界

[COMMUNITY_FOUNDATION](COMMUNITY_FOUNDATION.md)のAIIdentityは、安定ID・表示名・運営主体・停止状態を持ち、人間Userやモデル名と別に管理する構想である。現行コミュニティ試作は参加方針の表示・操作例を持つが、ラボから参照できる正式な公式AIIdentityレコードはまだない。

そのため `official-ai.ts.txt` に**表示用の参照bindingだけ**を置く。

- `identityRef.kind = AIIdentity`
- `identityRef.key = plunode-official-ai`：公式AIを指す一つの論理参照キー。DB IDや登録済みアカウントではない。
- `identityRef.id = null`、`connection = not-connected`：正式登録・接続済みと装わない。

プロフィール、通常アイコン、コメント表示はすべてこの一つの参照を使う。将来はコミュニティ側の正規レジストリから公式AIの同一安定IDを解決し、このbindingへ供給する。表示名や画像別に新IDを作らない。レジストリを正本として運営主体・停止状態を受け取り、ラボにアカウント管理、別User、認証、参加権限、停止管理を複製しない。公式という表示だけで参加権限を与えない。

探索者見習いAIは保存済みartifactの既存 `aiId` をそのまま参照し、別枠の「観察対象」に表示する。公式AIの参照・画像を流用しない。後続のB′配置指示により、足のない浮遊端末の仮画像を96pxで表示する。従来のfooterにあるAI IDも探索者見習いAIのIDと明記する。[B′の由来・表示契約](../../prototypes/apprentice-character/PROMPTS.md)。

## デモと実記録の分離

観察ノートの実件数の下に、育成担当プロフィール／探索者見習いと、育成コメント欄を並べる。PCは左右、スマホは縦に配置する。コメント見出しに48pxのB、3件の例文それぞれの横に20pxのCを使用する。コメントアイコンと署名行の中心を揃え、文字本文は13px・行高1.9、アイコンとの間隔10pxとする。装飾画像は空altとし、隣接する表示名を重複読み上げしない。

例文は新規のUI fixtureであり、`kind: display-demo` と `displayIdentityKey` を持つ。`authorId`、実投稿時刻、runId、学習版は持たない。見出しと各コメントのDEMO表示、冒頭の「AIが生成・投稿した発言ではない」、末尾の「活動履歴・成長記録に含めない」で実発言との違いを明示する。実験記録やCodexの既存説明文を公式AIの発言へ変換しない。

既存の非AI5件・推論前保留2件・実推論完了0件・追加学習済み0件、根拠、版比較、Graph／Claimへの往復は変更しない。デモは実行履歴タブに出さず、指標やartifactへ書き込まない。公式AIの実際のコメント生成・投稿・権限付与は実装しない。

## 確認先

- [育成担当とコメント](https://graph-ailab.isinxnisi.com/ai-lab#mentorship)
- [コメント欄](https://graph-ailab.isinxnisi.com/ai-lab#mentoring-comments)
- [従来の比較画面](https://graph-ailab.isinxnisi.com/ai-character-study)

[検証記録](../verification/AI_LAB_OFFICIAL_MENTOR_20261022.md)。正式名称・アニメーション・実コメント生成／自動投稿・権限・main統合・beta／VPS正式反映は保留する。
